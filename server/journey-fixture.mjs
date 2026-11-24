export function journeyFixture(path) {
  const page =
    path === "/store"
      ? '<h1>Island Market</h1><a href="/product">Test mango</a>'
      : path === "/product"
        ? "<h1>Test mango</h1><p>Sold by Island Market</p>"
        : "<h1>Choose a location</h1><button type=\"button\" onclick=\"localStorage.setItem('location','Jamaica');document.querySelector('#location').textContent='Sending to Jamaica'\">Jamaica</button><a href=\"/store\">Island Market</a>";
  return `<!doctype html><html lang="en"><title>AsBuilt fictional journey</title><body><p>FICTIONAL TEST FIXTURE</p><p id="location"></p>${page}<script>document.querySelector('#location').textContent='Sending to '+(localStorage.getItem('location')||'no location');</script></body></html>`;
}
