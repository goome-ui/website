(function () {
  var back = document.getElementById("backBtn");
  if (!back) return;
  back.addEventListener("click", function (e) {
    var same = false;
    try { same = document.referrer && new URL(document.referrer).origin === location.origin; } catch (err) {}
    if (same && history.length > 1) {
      e.preventDefault();
      history.back();
    }
  });
})();
