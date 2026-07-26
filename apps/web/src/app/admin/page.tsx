import { redirect } from 'next/navigation'

/** doc 13 §14: `/admin` is an entrance, not a screen. */
export default function AdminIndexPage(): never {
  redirect('/admin/dev')
}
