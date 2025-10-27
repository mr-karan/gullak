import { notify } from '@kyvg/vue3-notification'

export function useNotifications() {
  const success = (message: string) => {
    notify({
      type: 'success',
      title: 'Success',
      text: message,
      duration: 3000
    })
  }

  const error = (message: string) => {
    notify({
      type: 'error',
      title: 'Error',
      text: message,
      duration: 5000
    })
  }

  const warning = (message: string) => {
    notify({
      type: 'warning',
      title: 'Warning',
      text: message,
      duration: 4000
    })
  }

  const info = (message: string) => {
    notify({
      type: 'info',
      title: 'Info',
      text: message,
      duration: 3000
    })
  }

  return {
    success,
    error,
    warning,
    info
  }
}