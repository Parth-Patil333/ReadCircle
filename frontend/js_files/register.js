document.getElementById('registerForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const username = document.getElementById('username').value;
    const email = document.getElementById('email').value;   // ✅ include email
    const password = document.getElementById('password').value;

    try {
        const res = await fetch('https://readcircle.onrender.com/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, email, password })  // ✅ send all fields
        });

        const data = await res.json();
        if (res.ok) {
            alert(data.message);
            window.location.href = 'login.html'; // Redirect after registration
        } else {
            alert(data.message || 'Registration failed');
        }
    } catch (error) {
        console.error('Error:', error);
        alert('Something went wrong. Please try again.');
    }
});
