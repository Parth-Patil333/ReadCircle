// listing.js (protected page)
const API_BASE_URL = "https://readcircle.onrender.com/api";

// ✅ gate the page + get a valid token
const token = requireAuth();

// ✅ Add new listing
document.getElementById('listingForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const title = document.getElementById('title').value;
  const author = document.getElementById('author').value;
  const condition = document.getElementById('condition').value;
  const sellerName = document.getElementById('sellerName').value;
  const sellerContact = document.getElementById('sellerContact').value;
  const sellerAddress = document.getElementById('sellerAddress').value;

  try {
    const res = await authFetch(`${API_BASE_URL}/books`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, author, condition, sellerName, sellerContact, sellerAddress })
    });
    const data = await res.json();
    alert(data.message || "Listing added");
    loadListings();
  } catch (err) {
    console.error(err);
    alert("Failed to add listing");
  }
});

// ✅ Load all listings (your backend may return only your listings or all public listings)
async function loadListings() {
  try {
    const res = await authFetch(`${API_BASE_URL}/books`, { method: 'GET' });
    const listings = await res.json();
    const list = document.getElementById('listingList');
    list.innerHTML = '';
    listings.forEach(book => {
      const li = document.createElement('li');
      li.innerHTML = `
        ${book.title} by ${book.author || 'Unknown'} (${book.condition}) 
        - Seller: ${book.sellerName}
        <br>
        <button onclick="updateListing('${book._id}')">Update</button>
        <button onclick="deleteListing('${book._id}')">Delete</button>
        <button onclick="confirmListing('${book._id}')">Confirm</button>
        <button onclick="cancelListing('${book._id}')">Cancel</button>
      `;
      list.appendChild(li);
    });
  } catch (err) {
    console.error(err);
    alert("Failed to load listings");
  }
}

// ✅ Update listing (owner-only)
async function updateListing(id) {
  const newTitle = prompt("Enter new book title:");
  if (!newTitle) return;
  try {
    const res = await authFetch(`${API_BASE_URL}/books/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: newTitle })
    });
    const data = await res.json();
    alert(data.message || "Listing updated");
    loadListings();
  } catch (err) {
    console.error(err);
    alert("Failed to update listing");
  }
}

// ✅ Delete listing (owner-only)
async function deleteListing(id) {
  if (!confirm("Are you sure you want to delete this listing?")) return;
  try {
    const res = await authFetch(`${API_BASE_URL}/books/${id}`, { method: 'DELETE' });
    const data = await res.json();
    alert(data.message || "Listing deleted");
    loadListings();
  } catch (err) {
    console.error(err);
    alert("Failed to delete listing");
  }
}

// ✅ Confirm listing (buyer action)
async function confirmListing(id) {
  try {
    const res = await authFetch(`${API_BASE_URL}/books/${id}/confirm`, { method: 'PUT' });
    const data = await res.json();
    alert(data.message || "Listing confirmed");
    loadListings();
  } catch (err) {
    console.error(err);
    alert("Failed to confirm listing");
  }
}

// ✅ Cancel listing (buyer action)
async function cancelListing(id) {
  try {
    const res = await authFetch(`${API_BASE_URL}/books/${id}/cancel`, { method: 'PUT' });
    const data = await res.json();
    alert(data.message || "Listing canceled");
    loadListings();
  } catch (err) {
    console.error(err);
    alert("Failed to cancel listing");
  }
}

// ✅ Cleanup (manual trigger for testing)
async function cleanupListings() {
  try {
    const res = await authFetch(`${API_BASE_URL}/books/cleanup`, { method: 'DELETE' });
    const data = await res.json();
    alert(data.message || "Cleanup done");
    loadListings();
  } catch (err) {
    console.error(err);
    alert("Failed to cleanup");
  }
}

// Load on page open
loadListings();
