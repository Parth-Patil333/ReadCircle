// Hardcoded credentials (you can change them)
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

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        if (!email || !password) {
            alert("Please fill in both email and password.");
            return;
        }

        if (!emailRegex.test(email)) {
            alert("Please enter a valid email address.");
            return;
        }

        if (email === validEmail && password === validPassword) {
            // Show a temporary success message
            showAutoClosingAlert("Login Successful! Redirecting...", 1500, () => {
                window.location.href = "dashboard.html";
            });
        } else {
            alert("Invalid email or password.");
        }
    });
});

function showAutoClosingAlert(message, delay, callback) {
    const alertBox = document.createElement("div");
    alertBox.textContent = message;
    alertBox.style.position = "fixed";
    alertBox.style.top = "20px";
    alertBox.style.left = "50%";
    alertBox.style.transform = "translateX(-50%)";
    alertBox.style.background = "#6610F2";
    alertBox.style.color = "white";
    alertBox.style.padding = "1rem 2rem";
    alertBox.style.borderRadius = "1rem";
    alertBox.style.boxShadow = "0 4px 10px rgba(0,0,0,0.3)";
    alertBox.style.zIndex = "1000";
    alertBox.style.fontSize = "1rem";
    alertBox.style.opacity = "0.95";

    document.body.appendChild(alertBox);

    setTimeout(() => {
        alertBox.remove();
        if (callback) callback();
    }, delay);
}
