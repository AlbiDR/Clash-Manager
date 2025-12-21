
import { useRouter } from 'vue-router'
import { useToast } from './useToast'

export function useShareTarget() {
    const router = useRouter()
    const { success } = useToast()

    function handleShareTarget() {
        const params = new URLSearchParams(window.location.search)
        const text = params.get('text') || params.get('title') || params.get('url')

        if (text) {
            // Looks for #XXXXXX or tag=XXXXXX
            const tagMatch = text.match(/(?:#|tag=)([0-9A-Z]{3,9})/i)

            if (tagMatch && tagMatch[1]) {
                const extractedTag = tagMatch[1].toUpperCase()
                success(`Shared Tag Found: #${extractedTag}`)

                // Clean URL
                window.history.replaceState({}, document.title, window.location.pathname)

                // Redirect to Recruiter with filter
                router.push({ path: '/recruiter', query: { pin: extractedTag } })
            }
        }
    }

    return {
        handleShareTarget
    }
}
