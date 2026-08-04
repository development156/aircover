import { redirect } from 'next/navigation'

// No marketing page in Alpha — the root goes straight to the shell.
export default function RootPage() {
  redirect('/home')
}
