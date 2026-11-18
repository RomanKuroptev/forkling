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
  var answeringEl = document.getElementById('note-answering')
  var replyTo = null

  // The name this browser gave is remembered here (and only here), so a visitor is "you are: Kim" next time; "not you?" forgets it.
  var whoEl = document.getElementById('note-who')
  var whoName = document.getElementById('note-who-name')
  function store(name) {
    try { if (window.localStorage) { if (name) localStorage.setItem('merge95:name', name); else localStorage.removeItem('merge95:name') } } catch (e) {}
  }
  function remembered() {
    try { return (window.localStorage && localStorage.getItem('merge95:name')) || '' } catch (e) { return '' }
  }
  function showWho(name) {
    if (!whoEl || !whoName) return
    whoName.textContent = name
    whoEl.hidden = !name
  }
  var known = remembered()
  if (known && nameEl && !nameEl.value) nameEl.value = known
  showWho(known)
  var notYou = document.getElementById('note-notyou')
  if (notYou) {
    notYou.addEventListener('click', function (event) {
      if (event.preventDefault) event.preventDefault()
      store('')
      if (nameEl) nameEl.value = ''
      showWho('')
    })
  }

  // An "Answer" button under Merge's latest reply in an open thread makes the next note an answer to it.
  var buttons = document.querySelectorAll ? document.querySelectorAll('[data-answer]') : []
  for (var b = 0; b < buttons.length; b++) {
    buttons[b].addEventListener('click', function (event) {
      replyTo = this.getAttribute('data-answer')
      if (answeringEl) {
        answeringEl.textContent = 'You are answering Merge in a thread. Reload the page to leave a new note instead.'
        answeringEl.hidden = false
      }
      if (messageEl.scrollIntoView) messageEl.scrollIntoView()
    })
  }

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

  // The front page's compact form keeps the notice, the name and the human check in a part that is hidden until the field is used.
  // A note is never sent while that part is still hidden: the first press only opens it.
  var extraEl = document.getElementById('note-extra')
  function openNotice() {
    if (extraEl) extraEl.hidden = false
  }
  if (extraEl) messageEl.addEventListener('focus', openNotice)

  form.addEventListener('submit', function (event) {
    event.preventDefault()
    if (extraEl && extraEl.hidden) {
      openNotice()
      return say('Read the notice above, then press Send.', false)
    }
    var message = messageEl.value.trim()
    if (!message) return say('Write something first.', false)
    var check = token()
    if (!check) return say('Please complete the check first.', false)
    sendEl.disabled = true
    say('Sending...', true)
    var payload = { name: nameEl.value, message: message, placeId: 'home', token: check }
    if (replyTo) payload.replyTo = replyTo
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
      .then(function (response) {
        return response.json().catch(function () { return {} }).then(function (body) { return { status: response.status, body: body } })
      })
      .then(function (result) {
        if (result.status === 202 && result.body && result.body.ok) {
          say('Thank you. Your note is in the mailbox. Merge will find it when it comes by.', true)
          messageEl.value = ''
          var given = String(nameEl.value || '').trim()
          if (given) { store(given); showWho(given) }
          replyTo = null
          if (answeringEl) answeringEl.hidden = true
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
