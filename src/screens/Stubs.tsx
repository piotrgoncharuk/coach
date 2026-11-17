import { Badge, EmptyState, Screen } from '../ui/components'
import { SyncBadge } from '../ui/SyncBadge'

/**
 * Экраны, которые наполняются на следующих этапах. Показываем честно:
 * что здесь будет и когда, вместо пустой страницы или подделки.
 */
function Stub({ title, stage, what, items }: { title: string; stage: string; what: string; items: string[] }) {
  return (
    <Screen title={title} action={<SyncBadge />}>
      <EmptyState title={what} text={`Появится на этапе ${stage}.`} />
      <ul className="space-y-2 px-1">
        {items.map((i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-fg-2">
            <span className="mt-2 size-1.5 shrink-0 rounded-full bg-fg-3" aria-hidden />
            {i}
          </li>
        ))}
      </ul>
      <div className="pt-2 text-center">
        <Badge tone="accent">этап {stage}</Badge>
      </div>
    </Screen>
  )
}

export const ProgramScreen = () => (
  <Stub
    title="Программа"
    stage="3"
    what="Программы ещё нет"
    items={[
      'Три тренировочных дня на всё тело, с учётом спины и бедра',
      'Недельный календарь: зал, футбол, отдых',
      'Футбол одним касанием: длительность и тяжесть 1–10',
      'Правило «тяжёлые ноги не рядом с футболом» с предложением переставить дни',
      'Версии программы и откат к прошлой',
    ]}
  />
)

export const ProgressScreen = () => (
  <Stub
    title="Прогресс"
    stage="4"
    what="Данных для графиков пока нет"
    items={[
      'Вес: сырые точки и скользящее среднее за 7 дней',
      'Обхваты: грудь, талия, бёдра, бицепс, бедро, шея',
      'Питание: кольца за день, среднее за неделю, «повторить вчерашнее»',
      'Восстановление: утренний чек-ин за 10 секунд и индикатор готовности',
      'Аналитика: расчётный 1ПМ, недельный объём по мышцам, экспорт в JSON и CSV',
    ]}
  />
)
