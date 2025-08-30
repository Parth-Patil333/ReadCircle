const BookListing = require('../models/BookListing');

// Add a new listing
const addListing = async (req, res) => {
  try {
    const { title, author, condition, sellerName, sellerContact, sellerAddress } = req.body;
    const listing = new BookListing({ title, author, condition, sellerName, sellerContact, sellerAddress });
    await listing.save();
    res.status(201).json({ message: 'Book listed successfully', listing });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Get all available listings
const getListings = async (req, res) => {
  try {
    const listings = await BookListing.find().sort({ createdAt: -1 });
    res.json(listings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Update listing
const updateListing = async (req, res) => {
  try {
    const { id } = req.params;
    const updated = await BookListing.findByIdAndUpdate(id, req.body, { new: true });
    if (!updated) return res.status(404).json({ message: 'Listing not found' });
    res.json({ message: 'Listing updated', updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Delete listing
const deleteListing = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await BookListing.findByIdAndDelete(id);
    if (!deleted) return res.status(404).json({ message: 'Listing not found' });
    res.json({ message: 'Listing deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Confirm a listing (makes invisible to others)
const confirmListing = async (req, res) => {
  try {
    const { id } = req.params;
    const listing = await BookListing.findById(id);
    if (!listing) return res.status(404).json({ message: 'Listing not found' });

    listing.status = 'confirmed';
    listing.confirmedAt = new Date();
    await listing.save();

    res.json({ message: 'Listing confirmed by buyer', listing });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Cancel a confirmed listing (make visible again)
const cancelListing = async (req, res) => {
  try {
    const { id } = req.params;
    const listing = await BookListing.findById(id);
    if (!listing) return res.status(404).json({ message: 'Listing not found' });

    listing.status = 'available';
    listing.confirmedAt = null;
    await listing.save();

    res.json({ message: 'Listing cancelled and made available again', listing });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Cleanup: delete confirmed listings if not continued within 48 hrs
const cleanupListings = async () => {
  const now = new Date();
  const cutoff = new Date(now.getTime() - 48 * 60 * 60 * 1000); // 48 hours ago
  await BookListing.deleteMany({ status: 'confirmed', confirmedAt: { $lt: cutoff } });
};

module.exports = {
  addListing,
  getListings,
  updateListing,
  deleteListing,
  confirmListing,
  cancelListing,
  cleanupListings
};
