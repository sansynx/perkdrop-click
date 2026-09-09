import { createFileRoute } from '@tanstack/react-router'
import { PerkdropApp } from '../components/perkdrop-app'

export const Route = createFileRoute('/')({ component: Home })

function Home() {
  return <PerkdropApp />
}
