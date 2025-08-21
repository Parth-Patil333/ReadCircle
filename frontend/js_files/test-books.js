document.getElementById('addBookForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = document.getElementById('title').value;
    const author = document.getElementById('author').value;
    const status = document.getElementById('status').value;

    const res = await fetch('http://localhost:5000/api/books', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, author, status })
    });
    const data = await res.json();
    alert(data.message || JSON.stringify(data));
});

async function loadBooks() {
    const res = await fetch('http://localhost:5000/api/books');
    const books = await res.json();
    const list = document.getElementById('bookList');
    list.innerHTML = '';
    books.forEach(book => {
        const li = document.createElement('li');
        li.textContent = `${book.title} by ${book.author} - ${book.status}`;
        list.appendChild(li);
    });
}