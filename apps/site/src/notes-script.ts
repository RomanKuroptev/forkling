/**
 * `notes.js`: what the form on `/notes/` does (spec 10.1). It posts the note as JSON to the server's `POST /notes` with the
 * Turnstile token and the place Home (a note written on this page is at Home's mailbox), and shows the server's own words. Every
 * word it shows goes in through `textContent`, never as markup, so nothing the server or a visitor writes can become part of the
 * page. A Turnstile token works once, so the widget is reset after every try. Plain ES5, no libraries.
 */
export const NOTES_SCRIPT = `(function () {
  var form = document.getElementById('note-form')
  if (!form) return
  var url = form.getAttribute('data-endpoint')
  var nameEl = document.getElementById('note-name')
  var messageEl = document.getElementById('note-message')
  var sendEl = document.getElementById('note-send')
  var statusEl = document.getElementById('note-status')

  function say(text, ok) {
    statusEl.textContent = text
    statusEl.className = ok ? 'note-ok' : 'note-error'
  }
  function token() {
    var field = form.querySelector('[name="cf-turnstile-response"]')
    if (field && field.value) return field.value
    if (window.turnstile && window.turnstile.getResponse) return window.turnstile.getResponse() || ''
    return ''
  }
  function resetCheck() {
    if (window.turnstile && window.turnstile.reset) window.turnstile.reset()
  }

  form.addEventListener('submit', function (event) {
    event.preventDefault()
    var message = messageEl.value.trim()
    if (!message) return say('Write something first.', false)
    var check = token()
    if (!check) return say('Please complete the check first.', false)
    sendEl.disabled = true
    say('Sending...', true)
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: nameEl.value, message: message, placeId: 'home', token: check })
    })
      .then(function (response) {
        return response.json().catch(function () { return {} }).then(function (body) { return { status: response.status, body: body } })
      })
      .then(function (result) {
        if (result.status === 202 && result.body && result.body.ok) {
          say('Thank you. Your note is in the mailbox. Merge will find it when it comes by.', true)
          messageEl.value = ''
        } else {
          say(result.body && typeof result.body.error === 'string' ? result.body.error : 'Something went wrong. Try again in a moment.', false)
        }
      })
      .catch(function () {
        say('Could not reach Merge. Try again in a moment.', false)
      })
      .then(function () {
        sendEl.disabled = false
        resetCheck()
      })
  })
})()
`
