import { useStore } from '../../data/mockStore.jsx'
import { HqStoreProvider } from '../../data/hq/hqStore.jsx'

export default function HqBridge({ children }) {
  const { user, me } = useStore()
  const profileName = me?.name && me.name !== 'Tu' ? me.name : (user?.user_metadata?.full_name || user?.user_metadata?.name || '')
  return (
    <HqStoreProvider
      authUid={user?.id}
      profileName={profileName}
      profileEmail={user?.email}
    >
      {children}
    </HqStoreProvider>
  )
}
