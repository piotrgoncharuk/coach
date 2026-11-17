import { useState } from 'react'
import { localDate, IMPORT_EXAMPLE } from '../../domain'
import { buildCsv, buildExport, CSV_LABEL, download, importJson, type CsvKind, type ImportReport } from '../../lib/transfer'
import { Button, Card } from '../../ui/components'

/** Экспорт всех данных и импорт прошлых тренировок. */
export function DataCard() {
  const [text, setText] = useState('')
  const [report, setReport] = useState<ImportReport | null>(null)
  const [busy, setBusy] = useState(false)

  async function exportJson() {
    download(`coach-${localDate()}.json`, JSON.stringify(await buildExport(), null, 1))
  }
  async function exportCsv(kind: CsvKind) {
    download(`coach-${kind}-${localDate()}.csv`, await buildCsv(kind), 'text/csv')
  }
  async function onFile(file: File | undefined) {
    if (file) setText(await file.text())
  }
  async function run() {
    setBusy(true)
    setReport(await importJson(text))
    setBusy(false)
  }

  return (
    <Card>
      <h2 className="mb-2 font-semibold">Данные</h2>
      <Button variant="primary" className="w-full" onClick={() => void exportJson()}>Скачать всё (JSON)</Button>
      <p className="mt-1 text-xs text-fg-3">Полная копия: из неё можно восстановиться на любом устройстве.</p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {(Object.keys(CSV_LABEL) as CsvKind[]).map((k) => (
          <Button key={k} onClick={() => void exportCsv(k)}>{CSV_LABEL[k]}, CSV</Button>
        ))}
      </div>

      <h3 className="mb-1 mt-5 font-semibold">Импорт</h3>
      <p className="mb-2 text-sm text-fg-2">Полная копия из «Скачать всё» или прошлые тренировки в простом формате. Существующие записи не удаляются.</p>
      <input type="file" accept="application/json,.json" onChange={(e) => void onFile(e.currentTarget.files?.[0])}
        className="mb-2 block w-full text-sm text-fg-2 file:mr-3 file:min-h-touch file:rounded-card file:border-0 file:bg-raised file:px-4 file:text-fg" aria-label="Файл для импорта" />
      <textarea rows={4} value={text} onChange={(e) => setText(e.currentTarget.value)} placeholder="…или вставь JSON сюда" aria-label="JSON для импорта"
        className="w-full rounded-card border border-border bg-raised px-3 py-2 font-mono text-sm placeholder:text-fg-3" />
      <details className="mt-1 text-xs text-fg-3">
        <summary className="min-h-touch cursor-pointer">Формат прошлых тренировок</summary>
        <pre className="overflow-x-auto rounded-card bg-raised p-2 text-[11px] leading-snug">{JSON.stringify(IMPORT_EXAMPLE, null, 1)}</pre>
        <p className="mt-1">Упражнение — название по-русски или по-английски, как в справочнике. Запас (rir) и тип — необязательны.</p>
      </details>
      <Button className="mt-2 w-full" disabled={!text.trim() || busy} onClick={() => void run()}>{busy ? 'Импортирую…' : 'Импортировать'}</Button>
      {report && (
        <div role="status" className={`mt-3 rounded-card p-3 text-sm ${report.errors.length ? 'bg-danger/10' : 'bg-success/10'}`}>
          {report.kind === 'backup'
            ? <p>Копия: добавлено {report.added}, обновлено {report.updated}, без изменений {report.skipped}.</p>
            : <p>Тренировок добавлено: {report.added}.</p>}
          {report.errors.length > 0 && <ul className="mt-1 list-disc space-y-0.5 pl-5 text-danger">{report.errors.map((e) => <li key={e}>{e}</li>)}</ul>}
        </div>
      )}
    </Card>
  )
}
