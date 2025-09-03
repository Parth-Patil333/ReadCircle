const BASE_URL = "https://readcircle.onrender.com/api/auth/register"; 
// 🔑 replace with your actual Render backend URL

document.getElementById("registerForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  const username = document.getElementById("username").value;
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;

  try {
    const res = await fetch(`${BASE_URL}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, email, password })
    });

    const data = await res.json();
    alert(data.message);

    if (data.token) {
      localStorage.setItem("token", data.token);
      window.location.href = "dashboard.html"; // redirect after register
    }
  } catch (err) {
    console.error(err);
    alert("Registration failed");
  }
});
