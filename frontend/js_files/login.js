// Hardcoded demo credentials (optional)
const validEmail = "user@example.com";
const validPassword = "password123";

document.addEventListener("DOMContentLoaded", () => {
    const form = document.querySelector(".login");

    form.addEventListener("submit", (e) => {
        e.preventDefault();

        const emailInput = document.getElementById("user-email");
        const passwordInput = document.getElementById("user-pass");

        const email = emailInput.value.trim();
        const password = passwordInput.value.trim();

        // Basic email regex
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        // Validation
        if (!email || !password) {
            alert("Please fill in both email and password.");
            return;
        }

        if (!emailRegex.test(email)) {
            alert("Please enter a valid email address.");
            return;
        }

        // Optional: Check against hardcoded credentials
        if (email === validEmail && password === validPassword) {
            alert("Login successful!");
            // Redirect or load dashboard
            window.location.href = "dashboard.html"; // Replace with your page
        } else {
            alert("Invalid email or password.");
        }
    });
});
