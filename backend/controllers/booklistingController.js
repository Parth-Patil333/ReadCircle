// controllers/booklistingController.js
const mongoose = require('mongoose');
const BookListing = require('../models/BookListing');
const sanitize = require('sanitize-html'); // optional: sanitize text inputs; add to package.json if you want

// Helper: get io instance (req.app.get('io') preferred)
function getIo(req) {
  return (req && req.app && req.app.get && req.app.get('io')) || global.__io || null;
}

// Helper: safe ObjectId check
function isValidId(id) {
  return mongoose.Types.ObjectId.isValid(String(id));
}

// Helper: compute reservedUntil default (48 hours)
function computeReservedUntil(ms = 48 * 60 * 60 * 1000) {
  return new Date(Date.now() + ms);
}

/**
 * Create a listing
 * POST /api/booklisting
 * body: { title, author, condition, price, currency, images[], sellerContact }
 */
exports.createListing = async (req, res, next) => {
  try {
    const sellerId = req.user && req.user.id;
    if (!sellerId) return res.status(401).json({ success: false, message: 'Authentication required' });

    const { title, author, condition, price, currency, images, sellerContact } = req.body;

    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      return res.status(400).json({ success: false, message: 'title is required' });
    }

    // sanitize basic text fields (prevent stored XSS)
    const safeTitle = sanitize(String(title).trim(), { allowedTags: [], allowedAttributes: {} });
    const safeAuthor = author ? sanitize(String(author).trim(), { allowedTags: [], allowedAttributes: {} }) : '';
    const safeSellerContact = sellerContact ? sanitize(String(sellerContact).trim(), { allowedTags: [], allowedAttributes: {} }) : '';

    const listing = new BookListing({
      title: safeTitle,
      author: safeAuthor,
      condition: condition || undefined,
      price: typeof price === 'number' ? price : Number(price) || 0,
      currency: currency || 'INR',
      images: Array.isArray(images) ? images.map(String) : [],
      sellerId,
      sellerContact: safeSellerContact
    });

    await listing.save();

    // Emit new-listing to listing room for live updates
    const io = getIo(req);
    if (io) io.to('listings').emit('new-listing', listing.toObject());

    res.status(201).json({ success: true, data: listing });
  } catch (err) {
    next(err);
  }
};

/**
 * Get listings (public)
 * GET /api/booklisting
 * query: page, limit, q (text search), minPrice, maxPrice, condition
 * optional query: includeReservedMine=1  -> include listings reserved by the requesting user
 */
exports.getListings = async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.min(100, Math.max(5, parseInt(req.query.limit || '12', 10)));
    const skip = (page - 1) * limit;

    const q = req.query.q ? String(req.query.q).trim() : null;
    const minPrice = (typeof req.query.minPrice !== 'undefined' && req.query.minPrice !== '') ? Number(req.query.minPrice) : undefined;
    const maxPrice = (typeof req.query.maxPrice !== 'undefined' && req.query.maxPrice !== '') ? Number(req.query.maxPrice) : undefined;
    const condition = req.query.condition ? String(req.query.condition) : undefined;

    // whether to include listings reserved by the requesting user
    const includeReservedMine = String(req.query.includeReservedMine || '') === '1';
    const requestingUserId = req.user && (req.user.id || req.user._id) ? String(req.user.id || req.user._id) : null;

    const now = new Date();

    // Availability conditions: buyerId missing OR reservedUntil <= now (expired)
    const availabilityOr = [
      { buyerId: { $exists: false } },
      { reservedUntil: { $lte: now } }
    ];

    // Build base filter:
    // Default: only available listings (availabilityOr)
    // If includeReservedMine && requestingUserId: allow either available OR buyerId === requestingUserId
    let filter;
    if (includeReservedMine && requestingUserId) {
      filter = {
        $or: [
          ...availabilityOr,
          { buyerId: requestingUserId }
        ]
      };
    } else {
      // Only available listings
      filter = { $or: availabilityOr };
    }

    // Apply text search and other filters
    if (q) {
      // text index search (ensure you have a text index on title/author etc)
      filter.$text = { $search: q };
    }
    if (typeof minPrice !== 'undefined' && !Number.isNaN(minPrice)) {
      filter.price = Object.assign({}, filter.price || {}, { $gte: minPrice });
    }
    if (typeof maxPrice !== 'undefined' && !Number.isNaN(maxPrice)) {
      filter.price = Object.assign({}, filter.price || {}, { $lte: maxPrice });
    }
    if (condition) {
      filter.condition = condition;
    }

    const [items, total] = await Promise.all([
      BookListing.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean().exec(),
      BookListing.countDocuments(filter)
    ]);

    const totalPages = Math.max(1, Math.ceil((total || 0) / limit));

    res.json({
      success: true,
      data: items,
      meta: { page, limit, total, totalPages }
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Get single listing by id
 * GET /api/booklisting/:id
 */
exports.getListing = async (req, res, next) => {
  try {
    const id = req.params.id;
    if (!isValidId(id)) return res.status(400).json({ success: false, message: 'Invalid id' });

    const listing = await BookListing.findById(id).lean().exec();
    if (!listing) return res.status(404).json({ success: false, message: 'Listing not found' });

    res.json({ success: true, data: listing });
  } catch (err) {
    next(err);
  }
};

/**
 * Update listing (owner only)
 * PATCH /api/booklisting/:id
 * body: fields to update (title, author, condition, price, currency, images, sellerContact)
 */
exports.updateListing = async (req, res, next) => {
  try {
    const id = req.params.id;
    if (!isValidId(id)) return res.status(400).json({ success: false, message: 'Invalid id' });

    const listing = await BookListing.findById(id);
    if (!listing) return res.status(404).json({ success: false, message: 'Listing not found' });

    const userId = req.user && req.user.id;
    if (!userId || String(listing.sellerId) !== String(userId)) {
      return res.status(403).json({ success: false, message: 'Not authorized to update' });
    }

    const allowed = ['title', 'author', 'condition', 'price', 'currency', 'images', 'sellerContact'];
    allowed.forEach((k) => {
      if (Object.prototype.hasOwnProperty.call(req.body, k)) {
        if (k === 'title' || k === 'author' || k === 'sellerContact') {
          listing[k] = sanitize(String(req.body[k] || '').trim(), { allowedTags: [], allowedAttributes: {} });
        } else if (k === 'images') {
          listing.images = Array.isArray(req.body.images) ? req.body.images.map(String) : [];
        } else if (k === 'price') {
          listing.price = Number(req.body.price) || 0;
        } else {
          listing[k] = req.body[k];
        }
      }
    });

    await listing.save();

    // Emit update to listings room
    const io = getIo(req);
    if (io) io.to('listings').emit('listing_updated', listing.toObject());

    res.json({ success: true, data: listing });
  } catch (err) {
    next(err);
  }
};

/**
 * Delete listing (owner only) - hard delete
 * DELETE /api/booklisting/:id
 */
exports.deleteListing = async (req, res, next) => {
  try {
    const id = req.params.id;
    if (!isValidId(id)) return res.status(400).json({ success: false, message: 'Invalid id' });

    const listing = await BookListing.findById(id);
    if (!listing) return res.status(404).json({ success: false, message: 'Listing not found' });

    const userId = req.user && req.user.id;
    if (!userId || String(listing.sellerId) !== String(userId)) {
      return res.status(403).json({ success: false, message: 'Not authorized to delete' });
    }

    await listing.deleteOne();

    const io = getIo(req);
    if (io) {
      io.to('listings').emit('listing_deleted', { id });
      // notify buyer if reserved
      if (listing.buyerId) io.to(String(listing.buyerId)).emit('listing_cancelled', { id, reason: 'seller_deleted' });
    }

    res.json({ success: true, data: { id } });
  } catch (err) {
    next(err);
  }
};

/**
 * Reserve a listing (buyer)
 * POST /api/booklisting/:id/reserve
 * - Sets buyerId, reservedAt, reservedUntil (default 48h)
 * - Fails if currently reserved (buyerId present and reservedUntil > now)
 */
exports.reserveListing = async (req, res, next) => {
  try {
    const id = req.params.id;
    const buyerId = req.user && req.user.id;
    if (!buyerId) return res.status(401).json({ success: false, message: 'Authentication required' });
    if (!isValidId(id)) return res.status(400).json({ success: false, message: 'Invalid id' });

    // Atomic check+set to avoid race
    const now = new Date();
    // A listing is considered available if buyerId missing OR reservedUntil <= now
    const listing = await BookListing.findOneAndUpdate(
      {
        _id: id,
        $or: [
          { buyerId: { $exists: false } },
          { reservedUntil: { $lte: now } }
        ]
      },
      {
        $set: {
          buyerId,
          reservedAt: now,
          reservedUntil: computeReservedUntil(48 * 60 * 60 * 1000)
        }
      },
      { new: true }
    ).exec();

    if (!listing) {
      return res.status(400).json({ success: false, message: 'Listing is not available for reservation' });
    }

    // Emit events
    const io = getIo(req);
    if (io) {
      // notify seller (sellerId room)
      io.to(String(listing.sellerId)).emit('listing_reserved', {
        listingId: listing._id,
        buyerId,
        reservedAt: listing.reservedAt,
        reservedUntil: listing.reservedUntil
      });
      // broadcast update to listings (client lists should refresh entry)
      io.to('listings').emit('listing_updated', listing.toObject());
    }

    res.json({ success: true, data: listing });
  } catch (err) {
    next(err);
  }
};

/**
 * Confirm sale (seller)
 * POST /api/booklisting/:id/confirm
 * - Only seller can confirm if buyer exists
 * - On confirm: we clear reservedUntil (optional), set buyerId (kept), and mark createdAt/updatedAt preserved
 *
 * Since model has no status, "sold" is represented by setting reservedUntil to null and leaving buyerId set.
 * If you want a separate 'sold' flag, we can add it later.
 */
exports.confirmSale = async (req, res, next) => {
  try {
    const id = req.params.id;
    const userId = req.user && req.user.id;
    if (!userId) return res.status(401).json({ success: false, message: 'Authentication required' });
    if (!isValidId(id)) return res.status(400).json({ success: false, message: 'Invalid id' });

    const listing = await BookListing.findById(id);
    if (!listing) return res.status(404).json({ success: false, message: 'Listing not found' });

    if (String(listing.sellerId) !== String(userId)) {
      return res.status(403).json({ success: false, message: 'Only seller can confirm sale' });
    }

    if (!listing.buyerId) {
      return res.status(400).json({ success: false, message: 'No active reservation to confirm' });
    }

    // Confirm sale: clear reservedUntil (sold) but keep buyerId as record
    listing.reservedUntil = undefined;
    listing.reservedAt = undefined;
    // Optionally we can set a meta flag soldAt
    listing.meta = listing.meta || {};
    listing.meta.soldAt = new Date();

    await listing.save();

    const io = getIo(req);
    if (io) {
      // notify buyer
      io.to(String(listing.buyerId)).emit('listing_confirmed', {
        listingId: listing._id,
        sellerId: listing.sellerId,
        soldAt: listing.meta.soldAt
      });
      // broadcast update so listing disappears or shows sold state
      io.to('listings').emit('listing_updated', listing.toObject());
    }

    res.json({ success: true, data: listing });
  } catch (err) {
    next(err);
  }
};

/**
 * Cancel reservation (buyer or seller)
 * POST /api/booklisting/:id/cancel
 * - If buyer cancels their reservation, clear buyerId/reserved*
 * - If seller cancels reservation, clear buyerId/reserved* and optionally delete listing
 */
exports.cancelReservation = async (req, res, next) => {
  try {
    const id = req.params.id;
    const actorId = req.user && req.user.id;
    if (!actorId) return res.status(401).json({ success: false, message: 'Authentication required' });
    if (!isValidId(id)) return res.status(400).json({ success: false, message: 'Invalid id' });

    const listing = await BookListing.findById(id);
    if (!listing) return res.status(404).json({ success: false, message: 'Listing not found' });

    const isSeller = String(listing.sellerId) === String(actorId);
    const isBuyer = listing.buyerId && String(listing.buyerId) === String(actorId);

    if (!isSeller && !isBuyer) {
      return res.status(403).json({ success: false, message: 'Not authorized to cancel this reservation' });
    }

    // Clear reservation fields
    const oldBuyerId = listing.buyerId ? String(listing.buyerId) : null;
    listing.buyerId = undefined;
    listing.reservedAt = undefined;
    listing.reservedUntil = undefined;
    await listing.save();

    const io = getIo(req);
    if (io) {
      // broadcast update to listings
      io.to('listings').emit('listing_updated', listing.toObject());
      // notify previous buyer (if exists)
      if (oldBuyerId) io.to(oldBuyerId).emit('listing_cancelled', { listingId: listing._id, by: actorId });
      // notify seller if buyer cancelled
      if (isBuyer) io.to(String(listing.sellerId)).emit('reservation_cancelled_by_buyer', { listingId: listing._id, buyerId: actorId });
    }

    res.json({ success: true, data: listing });
  } catch (err) {
    next(err);
  }
};
