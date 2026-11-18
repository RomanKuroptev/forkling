import { esc } from './md.ts'

/**
 * The share control of a work or project page (sharing S3): one "share" button and a "save picture" link, with a small script that loads
 * with the page and needs nothing else (no 3D world). The picture is the framed one the site build made for the page.
 */
export function shareRow(i: { root: string; title: string; save: string }): string {
  return `<p class="share-row"><button type="button" class="js-share" data-title="${esc(i.title)}">share</button> <a class="save-pic" href="${esc(i.root + i.save)}" download>save picture</a></p>\n<script src="${esc(i.root)}share.js" defer></script>`
}

/** `share.js`: the Web Share sheet where the browser has one (a phone), else the page's address is copied. Plain ES5; words go in with `textContent`. */
export const SHARE_SCRIPT = `(function () {
  var buttons = document.querySelectorAll ? document.querySelectorAll('.js-share') : []
  Array.prototype.forEach.call(buttons, function (b) {
    b.addEventListener('click', function () {
      var data = { title: b.getAttribute('data-title') || document.title, url: location.href }
      if (navigator.share) {
        navigator.share(data).catch(function () {})
      } else if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(data.url).then(function () { b.textContent = 'link copied' }, function () {})
      }
    })
  })
})()
`
