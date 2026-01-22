// Auto-year
(function setYear(){
    const y = document.getElementById("y");
    if (y) y.textContent = new Date().getFullYear();
  })();
  
  // Active nav highlighting
  (function activeNav(){
    const path = window.location.pathname;
  
    document.querySelectorAll(".links a").forEach(a => {
      const href = a.getAttribute("href");
      if (!href || href === "#contact") return;
  
      if (href === "/") {
        if (path === "/") a.classList.add("active");
        return;
      }
  
      // Match section roots like /articles/, /projects/
      if (path.startsWith(href)) a.classList.add("active");
    });
  })();
  