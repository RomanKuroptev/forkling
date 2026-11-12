/**
 * The site's one script (spec 8): the "since your last visit" panel on the home page. The browser keeps the time of the last
 * visit in `localStorage`; the script lists up to 8 entries of `changes.json` newer than that and shows the panel. Every access
 * to the store is guarded, so a browser that blocks it just never shows the panel. Words go in with `textContent`, never as
 * markup, so nothing in `changes.json` can become a tag. Written as plain ES5 so it runs anywhere, and kept as text so a test
 * can run the very same code against a fake page.
 */
export const SINCE_SCRIPT = `(function () {
  var box = document.getElementById('since')
  if (!box) return
  var root = (document.currentScript && document.currentScript.dataset && document.currentScript.dataset.root) || ''
  var KEY = 'forkling:lastVisit'
  var last = null
  try {
    last = window.localStorage.getItem(KEY)
  } catch (e) {
    return
  }
  var now = new Date().toISOString()
  fetch(root + 'changes.json')
    .then(function (r) {
      if (!r.ok) throw new Error('no changes')
      return r.json()
    })
    .then(function (list) {
      if (last) {
        var fresh = list.filter(function (c) { return c.at > last }).slice(0, 8)
        if (fresh.length > 0) {
          var ul = box.querySelector('ul')
          ul.replaceChildren()
          fresh.forEach(function (c) {
            var li = document.createElement('li')
            if (c.href) {
              var a = document.createElement('a')
              a.href = root + c.href
              a.textContent = c.text
              li.appendChild(a)
            } else {
              li.textContent = c.text
            }
            ul.appendChild(li)
          })
          box.hidden = false
        }
      }
      try {
        window.localStorage.setItem(KEY, now)
      } catch (e) {}
    })
    .catch(function () {})
})()
`
