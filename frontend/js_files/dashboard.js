// assumes auth.js defines: requireAuth(), parseJwt(), getToken()
const token = requireAuth();
const payload = parseJwt(token) || {};

// set greeting in two places (topbar + hero)
const nameText = payload.username || "Reader";
document.getElementById("welcomeName").textContent = nameText;
document.getElementById("welcomeInline").textContent = nameText;

// logout
document.getElementById("logoutBtn").addEventListener("click", () => {
  localStorage.removeItem("token");
  window.location.href = "login.html";
});
