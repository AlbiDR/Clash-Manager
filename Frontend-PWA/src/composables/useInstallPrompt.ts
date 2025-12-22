import { ref } from 'vue'

// Global state to hold the event
const deferredPrompt = ref<any>(null)
const isInstallable = ref(false)

// Initialize listener immediately when module loads (App start)
if (typeof window !== 'undefined') {
    window.addEventListener('beforeinstallprompt', (e) => {
        // Prevent Chrome 67 and earlier from automatically showing the prompt
        e.preventDefault()
        // Stash the event so it can be triggered later.
        deferredPrompt.value = e
        isInstallable.value = true
        console.log("📱 PWA Install Prompt captured globally")
    })
}

export function useInstallPrompt() {
    async function install() {
        if (!deferredPrompt.value) return

        // Show the install prompt
        deferredPrompt.value.prompt()

        // Wait for the user to respond to the prompt
        const { outcome } = await deferredPrompt.value.userChoice
        console.log(`📱 User response to install prompt: ${outcome}`)

        // We've used the prompt, and can't use it again, throw it away
        deferredPrompt.value = null
        isInstallable.value = false
    }

    return {
        isInstallable,
        install
    }
}
