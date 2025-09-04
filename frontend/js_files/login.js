const BASE_URL = "https://readcircle.onrender.com/api";

document.getElementById("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  const username = document.getElementById("username").value;
  const password = document.getElementById("password").value;

  try {
    const res = await fetch(`${BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });

    const data = await res.json();
    alert(data.message);

    if (data.token) {
      localStorage.setItem("token", data.token);
      window.location.href = "jornal-test.html"; // redirect after login
    }
  } catch (err) {
    console.error(err);
    alert("Login failed");
  }
});
