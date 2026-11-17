import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate } from 'react-router-dom'
import { dayTotals, localDate } from '../../domain'
import { db } from '../../lib/db'
import { alive } from '../../lib/workout'
import { Card } from '../../ui/components'
import { Ring } from '../../ui/Ring'

export function ProteinCard() {
  const navigate = useNavigate()
  const today = localDate()
  const data = useLiveQuery(async () => {
    const entries = alive(await db.nutritionEntries.where('date').equals(today).toArray())
    const profile = await db.profiles.toCollection().first()
    return { totals: dayTotals(entries, today), protein: profile?.proteinTarget ?? 190, kcal: profile?.kcalTarget ?? 3000 }
  }, [today])
  if (!data) return null
  return (
    <button onClick={() => navigate('/progress/food')} className="block w-full text-left" aria-label="Питание за день — открыть">
      <Card className="flex items-center justify-around">
        <Ring value={data.totals.proteinG} target={data.protein} label="Белок" unit="г" size={96} />
        <Ring value={data.totals.kcal} target={data.kcal} label="Калории" unit="ккал" size={96} />
      </Card>
    </button>
  )
}
