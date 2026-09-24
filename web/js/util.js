// deterministic color from owner/service
export function colorFor(owner, service){
  let key = owner || (service ? 'svc-'+service : '')
  if (!key) return ''
  let h = 2166136261
  for (let i=0;i<key.length;i++){ h ^= key.charCodeAt(i); h = (h*16777619)>>>0 }
  return `hsl(${h%360}, 45%, 30%)`
}
export const $ = (sel, root=document)=> root.querySelector(sel)
export const $$ = (sel, root=document)=> Array.from(root.querySelectorAll(sel))
export function el(tag, attrs={}, ...children){
  const e = document.createElement(tag)
  for (const [k,v] of Object.entries(attrs)){
    if (v === null || v === undefined || v === false) continue
    if (k === 'class') {
      e.className = v
    } else if (k === 'style') {
      e.style.cssText = v
    } else if (k.startsWith('on') && typeof v === 'function') {
      e.addEventListener(k.slice(2), v)
    } else if (v === true) {
      e.setAttribute(k, '')
    } else {
      e.setAttribute(k, v)
    }
  }
  for (const c of children){
    if (c==null) continue
    if (typeof c === 'string') e.appendChild(document.createTextNode(c))
    else e.appendChild(c)
  }
  return e
}


let _toast;
export function notify(msg, type='info', timeout=3500){
  if (!_toast){
    _toast = document.createElement('div')
    _toast.id = 'toast'
    _toast.style.cssText = 'position:fixed;right:16px;bottom:16px;display:flex;flex-direction:column;gap:8px;z-index:9999;'
    document.body.appendChild(_toast)
  }
  const el = document.createElement('div')
  el.className = 'toast ' + type
  el.textContent = msg
  el.style.cssText = 'background:#1b1b1b;border:1px solid #333;color:#eee;padding:8px 12px;border-radius:10px;box-shadow:0 4px 12px rgba(0,0,0,.35);font-size:13px;'
  _toast.appendChild(el)
  setTimeout(()=>{ el.style.opacity='0'; el.style.transform='translateY(6px)'; setTimeout(()=> el.remove(), 200) }, timeout)
}


export function pushToast(msg, type='info', timeout=null){
  // Default timeouts: errors stay longer
  if (timeout === null) {
    timeout = type === 'error' ? 8000 : type === 'warning' ? 6000 : 3500
  }
  
  let root = document.getElementById('toastRoot')
  if (!root) {
    root = document.createElement('div')
    root.id = 'toastRoot'
    root.className = 'toast-root'
    document.body.appendChild(root)
  }
  const el = document.createElement('div')
  el.className = 'toast ' + type
  el.textContent = msg
  root.appendChild(el)
  setTimeout(()=>{ el.style.opacity='0'; el.style.transform='translateY(6px)'; setTimeout(()=> el.remove(), 200) }, timeout)
}

// Modal warning - centered, click anywhere to dismiss
export function showWarningModal(msg) {
  const overlay = document.createElement('div')
  overlay.className = 'warning-modal-overlay'
  
  const modal = document.createElement('div')
  modal.className = 'warning-modal'
  modal.textContent = msg
  
  overlay.appendChild(modal)
  document.body.appendChild(overlay)
  
  const dismiss = () => {
    overlay.remove()
  }
  overlay.addEventListener('click', dismiss)
}

export function showConfirmModal(msg, confirmLabel = 'Delete') {
  return new Promise((resolve) => {
    const overlay = document.createElement('div')
    overlay.className = 'warning-modal-overlay'
    
    const modal = document.createElement('div')
    modal.className = 'warning-modal confirm-modal'
    modal.onclick = (e) => e.stopPropagation() // Prevent overlay dismiss
    
    const text = document.createElement('div')
    text.className = 'confirm-text'
    text.textContent = msg
    modal.appendChild(text)
    
    const buttons = document.createElement('div')
    buttons.className = 'confirm-buttons'
    
    const okBtn = document.createElement('button')
    okBtn.className = 'confirm-ok'
    okBtn.textContent = confirmLabel
    okBtn.onclick = () => {
      overlay.remove()
      resolve(true)
    }
    
    const cancelBtn = document.createElement('button')
    cancelBtn.className = 'confirm-cancel'
    cancelBtn.textContent = 'Cancel'
    cancelBtn.onclick = () => {
      overlay.remove()
      resolve(false)
    }
    
    buttons.appendChild(cancelBtn)
    buttons.appendChild(okBtn)
    modal.appendChild(buttons)
    
    overlay.appendChild(modal)
    document.body.appendChild(overlay)
    
    // Focus cancel by default for safety
    cancelBtn.focus()
  })
}


export function showPasswordResetModal(username) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div')
    overlay.className = 'warning-modal-overlay'

    const modal = document.createElement('div')
    modal.className = 'warning-modal confirm-modal'
    modal.onclick = (e) => e.stopPropagation()

    const text = document.createElement('div')
    text.className = 'confirm-text'
    text.textContent = 'Reset password for ' + username
    modal.appendChild(text)

    const form = document.createElement('div')
    form.className = 'password-reset-form'

    const password = document.createElement('input')
    password.type = 'password'
    password.placeholder = 'New password'
    password.autocomplete = 'new-password'

    const confirm = document.createElement('input')
    confirm.type = 'password'
    confirm.placeholder = 'Confirm new password'
    confirm.autocomplete = 'new-password'

    const error = document.createElement('div')
    error.className = 'login-error hidden'

    form.appendChild(password)
    form.appendChild(document.createElement('br'))
    form.appendChild(confirm)
    form.appendChild(document.createElement('br'))
    form.appendChild(error)
    modal.appendChild(form)

    const buttons = document.createElement('div')
    buttons.className = 'confirm-buttons'

    const cancelBtn = document.createElement('button')
    cancelBtn.className = 'confirm-cancel'
    cancelBtn.textContent = 'Cancel'

    const okBtn = document.createElement('button')
    okBtn.className = 'confirm-ok'
    okBtn.textContent = 'Reset Password'

    const dismiss = (value) => {
      overlay.remove()
      resolve(value)
    }
    const submit = () => {
      error.classList.add('hidden')
      if (password.value.length < 8) {
        error.textContent = 'Password must be at least 8 characters'
        error.classList.remove('hidden')
        password.focus()
        return
      }
      if (password.value !== confirm.value) {
        error.textContent = 'Passwords do not match'
        error.classList.remove('hidden')
        confirm.focus()
        return
      }
      dismiss(password.value)
    }

    cancelBtn.onclick = () => dismiss(null)
    okBtn.onclick = submit
    password.onkeydown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        confirm.focus()
      } else if (e.key === 'Escape') {
        dismiss(null)
      }
    }
    confirm.onkeydown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        submit()
      } else if (e.key === 'Escape') {
        dismiss(null)
      }
    }

    buttons.appendChild(cancelBtn)
    buttons.appendChild(okBtn)
    modal.appendChild(buttons)
    overlay.appendChild(modal)
    document.body.appendChild(overlay)
    password.focus()
  })
}
