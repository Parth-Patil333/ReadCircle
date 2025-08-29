const API_BASE_URL = "https://readcircle.onrender.com";

// ✅ Add new listing
document.getElementById('listingForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = document.getElementById('title').value;
    const author = document.getElementById('author').value;
    const condition = document.getElementById('condition').value;
    const sellerName = document.getElementById('sellerName').value;
    const sellerContact = document.getElementById('sellerContact').value;
    const sellerAddress = document.getElementById('sellerAddress').value;

    const res = await fetch(`${API_BASE_URL}/api/books`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, author, condition, sellerName, sellerContact, sellerAddress })
    });
    const data = await res.json();
    alert(data.message);
});

// ✅ Load all listings
async function loadListings() {
    const res = await fetch(`${API_BASE_URL}/api/books`);
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
}

// ✅ Update listing
async function updateListing(id) {
    const newTitle = prompt("Enter new book title:");
    if (!newTitle) return;
    const res = await fetch(`${API_BASE_URL}/api/books/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle })
    });
    const data = await res.json();
    alert(data.message);
    loadListings();
}

// ✅ Delete listing
async function deleteListing(id) {
    if (!confirm("Are you sure you want to delete this listing?")) return;
    const res = await fetch(`${API_BASE_URL}/api/books/${id}`, { method: 'DELETE' });
    const data = await res.json();
    alert(data.message);
    loadListings();
}

// ✅ Confirm listing
async function confirmListing(id) {
    const res = await fetch(`${API_BASE_URL}/api/books/${id}/confirm`, { method: 'PUT' });
    const data = await res.json();
    alert(data.message);
    loadListings();
}

// ✅ Cancel listing
async function cancelListing(id) {
    const res = await fetch(`${API_BASE_URL}/api/books/${id}/cancel`, { method: 'PUT' });
    const data = await res.json();
    alert(data.message);
    loadListings();
}

// ✅ Cleanup (manual trigger for testing)
async function cleanupListings() {
    const res = await fetch(`${API_BASE_URL}/api/books/cleanup`, { method: 'DELETE' });
    const data = await res.json();
    alert(data.message);
    loadListings();
}