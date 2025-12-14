import { ref, onMounted } from 'vue'

const deferredPrompt = ref<any>(null)
const isInstallable = ref(false)

export function useInstallPrompt() {

    function handler(e: Event) {
        // Prevent Chrome 67 and earlier from automatically showing the prompt
        e.preventDefault()
        // Stash the event so it can be triggered later.
        deferredPrompt.value = e
        isInstallable.value = true
        console.log("📱 PWA Install Prompt captured")
    }

    onMounted(() => {
        window.addEventListener('beforeinstallprompt', handler)
    })

    // Note: We generally don't remove the listener on unmount if we want global persistence, 
    // but for a composable it's safer to just rely on the global event unless we move this to a store.
    // For now, simple event listening in the component that needs it is fine, 
    // OR we keep it global. Let's make it safe for multiple usages.

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
