// Applies the saved theme before first paint to avoid a flash of the wrong colours.
try {
  var th = JSON.parse(localStorage.getItem('alpine-ota:theme') || '"system"');
  if (th === 'light' || th === 'dark') document.documentElement.setAttribute('data-theme', th);
} catch (e) {}
