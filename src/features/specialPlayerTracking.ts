import * as XLSX from "xlsx"
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  writeBatch,
  type Unsubscribe,
} from "firebase/firestore"
import { db } from "../firebase"
import type { UserReport } from "../components/tabs/Members.vue"

export const SPECIAL_PLAYER_COLLECTION = "specialPlayerTracking"
export const SPECIAL_PLAYER_IMPORT_COLLECTION = "specialPlayerTrackingImports"

export type PlayerMatchStatus = "matched" | "unmatched" | "ambiguous"

export type TrackingDay = {
  date: string
  stake: number
  refunded: number
  couponCount: number | null
  iddaaCount: number | null
  sportotoCount: number | null
  maxCouponAmount: number | null
}

export type TrackingPeriod = {
  importId: string
  fileName: string
  label: string
  startDate: string
  endDate: string
  stake: number
  refunded: number
  couponCount: number | null
  iddaaCount: number | null
  sportotoCount: number | null
  activeDays: number
  maxCouponAmount: number | null
}

export type TrackingSummary = {
  totalStake: number
  totalRefunded: number
  totalCouponCount: number | null
  couponCoveragePeriods: number
  activeDays: number
  activePeriods: number
  firstSeen: string | null
  lastSeen: string | null
  peakPeriodLabel: string | null
  peakPeriodStake: number
  averageCouponAmount: number | null
  maxCouponAmount: number | null
  lastFourPeriodsStake: number
  previousFourPeriodsStake: number
  trendPercent: number | null
}

export type TrackingPlayer = {
  id: string
  type: "player"
  signature: string
  maskedPhone: string
  memberId: number | null
  matchStatus: PlayerMatchStatus
  inCurrentMemberList: boolean
  memberSnapshotDay: string | null
  sourceImportIds: string[]
  periods: TrackingPeriod[]
  days: TrackingDay[]
  summary: TrackingSummary
  updatedAt?: unknown
}

export type TrackingImportRecord = {
  id: string
  fileName: string
  startDate: string
  endDate: string
  label: string
  status: "processing" | "completed" | "failed"
  playerCount: number
  totalStake: number
  totalCouponCount: number | null
  hasCouponDetail: boolean
  memberSnapshotDay: string | null
  createdAt?: unknown
  completedAt?: unknown
  errorMessage?: string
}

type ParsedPlayer = {
  id: string
  signature: string
  maskedPhone: string
  memberId: number | null
  matchStatus: PlayerMatchStatus
  period: TrackingPeriod
  days: TrackingDay[]
}

export type TrackingImportPreview = {
  importId: string
  fileName: string
  startDate: string
  endDate: string
  label: string
  totalStake: number
  totalRefunded: number
  totalCouponCount: number | null
  playerCount: number
  matchedPlayerCount: number
  unmatchedPlayerCount: number
  ambiguousPlayerCount: number
  invalidTurnoverRows: number
  invalidCouponRows: number
  turnoverRowCount: number
  couponRowCount: number
  hasCouponDetail: boolean
  warnings: string[]
  players: ParsedPlayer[]
}

type DayAccumulator = {
  date: string
  stake: number
  refunded: number
  couponIds: Set<string>
  iddaaCount: number
  sportotoCount: number
  maxCouponAmount: number
}

const roundMoney = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100

const toNumber = (value: unknown): number => {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0
  if (typeof value !== "string") return 0

  const trimmed = value.trim().replace(/\s/g, "")
  if (!trimmed) return 0

  const normalized = trimmed.includes(",")
    ? trimmed.replace(/\./g, "").replace(",", ".")
    : trimmed
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : 0
}

const pad = (value: number): string => String(value).padStart(2, "0")

const turkishMonthIndex: Record<string, number> = {
  ocak: 1,
  subat: 2,
  mart: 3,
  nisan: 4,
  mayis: 5,
  haziran: 6,
  temmuz: 7,
  agustos: 8,
  eylul: 9,
  ekim: 10,
  kasim: 11,
  aralik: 12,
}

const normalizeTurkishText = (value: string): string =>
  value
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i")
    .replace(/ş/g, "s")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")

const inferFilenameRange = (
  fileName: string,
  reportYear: number,
): { startDate: string; endDate: string } | null => {
  const normalized = normalizeTurkishText(fileName.replace(/\.(xlsx|xls)$/i, ""))
  const match = normalized.match(/(\d{1,2})\s*-\s*(\d{1,2})\s+([a-z]+)/)
  if (!match) return null

  const startDay = Number(match[1])
  const endDay = Number(match[2])
  const startMonth = turkishMonthIndex[match[3]]
  if (!startMonth || startDay < 1 || startDay > 31 || endDay < 1 || endDay > 31) return null

  let endMonth = startMonth
  let endYear = reportYear
  if (endDay < startDay) {
    endMonth += 1
    if (endMonth === 13) {
      endMonth = 1
      endYear += 1
    }
  }

  return {
    startDate: `${reportYear}-${pad(startMonth)}-${pad(startDay)}`,
    endDate: `${endYear}-${pad(endMonth)}-${pad(endDay)}`,
  }
}

const toIsoDate = (value: unknown): string | null => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`
  }

  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value)
    if (parsed) return `${parsed.y}-${pad(parsed.m)}-${pad(parsed.d)}`
  }

  const text = String(value ?? "").trim()
  if (!text) return null

  const trMatch = text.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/)
  if (trMatch) return `${trMatch[3]}-${pad(Number(trMatch[2]))}-${pad(Number(trMatch[1]))}`

  const isoMatch = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (isoMatch) return `${isoMatch[1]}-${pad(Number(isoMatch[2]))}-${pad(Number(isoMatch[3]))}`

  return null
}

export const formatIsoDate = (value: string | null): string => {
  if (!value) return "—"
  const [year, month, day] = value.split("-")
  return `${day}.${month}.${year}`
}

export const normalizeTurkishPhone = (value: unknown): string | null => {
  let digits = String(value ?? "").replace(/\D/g, "")
  if (digits.length === 12 && digits.startsWith("90")) digits = `0${digits.slice(2)}`
  if (digits.length === 10 && digits.startsWith("5")) digits = `0${digits}`
  return /^05\d{9}$/.test(digits) ? digits : null
}

export const signatureFromMemberPhone = (value: unknown): string | null => {
  const phone = normalizeTurkishPhone(value)
  return phone ? `${phone.slice(0, 4)}-${phone.slice(-4)}` : null
}

const signatureFromMaskedPhone = (value: unknown): string | null => {
  const text = String(value ?? "").trim()
  if (/^IM-/i.test(text) || /USER_/i.test(text)) return null

  const digits = text.replace(/\D/g, "")
  if (digits.length === 8 && /^05\d{6}$/.test(digits)) {
    return `${digits.slice(0, 4)}-${digits.slice(-4)}`
  }

  const fullPhone = normalizeTurkishPhone(text)
  return fullPhone ? `${fullPhone.slice(0, 4)}-${fullPhone.slice(-4)}` : null
}

const maskedPhoneFromSignature = (signature: string): string => {
  const [prefix, suffix] = signature.split("-")
  return `${prefix}***${suffix}`
}

const normalizeHeader = (value: unknown): string =>
  String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleUpperCase("tr-TR")

const normalizeRow = (row: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(Object.entries(row).map(([key, value]) => [normalizeHeader(key), value]))

const createMemberIndex = (members: UserReport[]): Map<string, UserReport[]> => {
  const index = new Map<string, UserReport[]>()
  for (const member of members) {
    const signature = signatureFromMemberPhone(member.phoneNumber)
    if (!signature) continue
    const matches = index.get(signature) ?? []
    matches.push(member)
    index.set(signature, matches)
  }
  return index
}

const sha256 = async (buffer: ArrayBuffer): Promise<string> => {
  const digest = await crypto.subtle.digest("SHA-256", buffer)
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
}

const getSheet = (workbook: XLSX.WorkBook, expectedName: string): XLSX.WorkSheet | null => {
  const name = workbook.SheetNames.find(
    (candidate) => normalizeHeader(candidate) === normalizeHeader(expectedName),
  )
  return name ? workbook.Sheets[name] : null
}

const getOrCreateDay = (
  players: Map<string, Map<string, DayAccumulator>>,
  signature: string,
  date: string,
): DayAccumulator => {
  if (!players.has(signature)) players.set(signature, new Map())
  const playerDays = players.get(signature)!
  if (!playerDays.has(date)) {
    playerDays.set(date, {
      date,
      stake: 0,
      refunded: 0,
      couponIds: new Set(),
      iddaaCount: 0,
      sportotoCount: 0,
      maxCouponAmount: 0,
    })
  }
  return playerDays.get(date)!
}

export const parseTrackingWorkbook = async (
  buffer: ArrayBuffer,
  fileName: string,
  members: UserReport[],
): Promise<TrackingImportPreview> => {
  const importId = await sha256(buffer)
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true })
  const turnoverSheet = getSheet(workbook, "GSM Bazlı EP İşlemler")
  const couponSheet = getSheet(workbook, "Kupon ID Bazında EP Raporu")

  if (!turnoverSheet) {
    throw new Error('Excel içinde "GSM Bazlı EP İşlemler" sayfası bulunamadı.')
  }

  const turnoverRows = XLSX.utils
    .sheet_to_json<Record<string, unknown>>(turnoverSheet, { defval: null, raw: true })
    .map(normalizeRow)
  const couponRows = couponSheet
    ? XLSX.utils
        .sheet_to_json<Record<string, unknown>>(couponSheet, { defval: null, raw: true })
        .map(normalizeRow)
    : []

  const players = new Map<string, Map<string, DayAccumulator>>()
  let invalidTurnoverRows = 0
  let invalidCouponRows = 0
  let turnoverRowCount = 0
  let couponRowCount = 0

  for (const row of turnoverRows) {
    if (String(row["AÇIKLAMA"] ?? "").trim() !== "Kupon Oynama") continue
    turnoverRowCount += 1

    const signature = signatureFromMaskedPhone(row["OYUNCU GSM"])
    const date = toIsoDate(row["TARİH"])
    if (!signature || !date) {
      invalidTurnoverRows += 1
      continue
    }

    const day = getOrCreateDay(players, signature, date)
    day.stake = roundMoney(day.stake + toNumber(row["TUTAR"]))
    day.refunded = roundMoney(day.refunded + toNumber(row["İADE EDİLEN TUTAR"]))
  }

  couponRows.forEach((row, index) => {
    if (String(row["İŞLEM TİPİ"] ?? "").trim() !== "Kupon Oynama") return
    couponRowCount += 1

    const signature = signatureFromMaskedPhone(row["OYUNCU GSM"])
    const date = toIsoDate(row["KUPON TARİHİ"])
    if (!signature || !date) {
      invalidCouponRows += 1
      return
    }

    // Kupon ID değerleri raporda maskeli gelebiliyor. Maskeli ID üzerinden tekilleştirme
    // farklı gerçek kuponları yanlışlıkla birleştirebileceği için her rapor satırı bir kupondur.
    const couponKey = `${signature}|${date}|row-${index}`

    const day = getOrCreateDay(players, signature, date)
    day.couponIds.add(couponKey)
    const couponType = normalizeHeader(row["KUPON TÜRÜ"])
    if (couponType === "IDDAA") day.iddaaCount += 1
    if (couponType === "SPORTOTO") day.sportotoCount += 1
    day.maxCouponAmount = Math.max(day.maxCouponAmount, toNumber(row["TUTAR"]))
  })

  if (players.size === 0) {
    throw new Error("Excel içinde maskeli GSM ile eşleştirilebilen Kupon Oynama kaydı bulunamadı.")
  }

  const allDates = Array.from(players.values()).flatMap((days) => Array.from(days.keys()))
  const startDate = allDates.sort()[0]
  const endDate = allDates.sort().at(-1)!
  const label = `${formatIsoDate(startDate)} – ${formatIsoDate(endDate)}`
  const memberIndex = createMemberIndex(members)
  const hasCouponDetail = Boolean(couponSheet)

  const parsedPlayers: ParsedPlayer[] = Array.from(players.entries()).map(([signature, dayMap]) => {
    const memberMatches = memberIndex.get(signature) ?? []
    const matchStatus: PlayerMatchStatus =
      memberMatches.length === 1 ? "matched" : memberMatches.length > 1 ? "ambiguous" : "unmatched"
    const days: TrackingDay[] = Array.from(dayMap.values())
      .map((day) => ({
        date: day.date,
        stake: roundMoney(day.stake),
        refunded: roundMoney(day.refunded),
        couponCount: hasCouponDetail ? day.couponIds.size : null,
        iddaaCount: hasCouponDetail ? day.iddaaCount : null,
        sportotoCount: hasCouponDetail ? day.sportotoCount : null,
        maxCouponAmount: hasCouponDetail ? roundMoney(day.maxCouponAmount) : null,
      }))
      .sort((a, b) => a.date.localeCompare(b.date))

    const stake = roundMoney(days.reduce((sum, day) => sum + day.stake, 0))
    const refunded = roundMoney(days.reduce((sum, day) => sum + day.refunded, 0))
    const couponCount = hasCouponDetail
      ? days.reduce((sum, day) => sum + (day.couponCount ?? 0), 0)
      : null
    const iddaaCount = hasCouponDetail
      ? days.reduce((sum, day) => sum + (day.iddaaCount ?? 0), 0)
      : null
    const sportotoCount = hasCouponDetail
      ? days.reduce((sum, day) => sum + (day.sportotoCount ?? 0), 0)
      : null
    const maxCouponAmount = hasCouponDetail
      ? Math.max(0, ...days.map((day) => day.maxCouponAmount ?? 0))
      : null

    return {
      id: signature,
      signature,
      maskedPhone: maskedPhoneFromSignature(signature),
      memberId: memberMatches.length === 1 ? memberMatches[0].memberId : null,
      matchStatus,
      days,
      period: {
        importId,
        fileName,
        label,
        startDate,
        endDate,
        stake,
        refunded,
        couponCount,
        iddaaCount,
        sportotoCount,
        activeDays: days.filter((day) => day.stake > 0 || (day.couponCount ?? 0) > 0).length,
        maxCouponAmount,
      },
    }
  })

  const warnings: string[] = []
  const filenameRange = inferFilenameRange(fileName, Number(startDate.slice(0, 4)))
  if (
    filenameRange &&
    (filenameRange.startDate !== startDate || filenameRange.endDate !== endDate)
  ) {
    warnings.push(
      `Dosya adı ${formatIsoDate(filenameRange.startDate)} – ${formatIsoDate(filenameRange.endDate)} diyor; Excel içindeki gerçek tarih ${label}.`,
    )
  }
  if (!hasCouponDetail) {
    warnings.push("Kupon ID sayfası bulunamadı; kupon adedi ve kupon türü analizleri hesaplanamayacak.")
  }
  if (invalidTurnoverRows > 0 || invalidCouponRows > 0) {
    warnings.push(
      `${invalidTurnoverRows + invalidCouponRows} satırda telefon veya tarih okunamadı; bu satırlar dışarıda bırakıldı.`,
    )
  }
  const ambiguousPlayerCount = parsedPlayers.filter((player) => player.matchStatus === "ambiguous").length
  if (ambiguousPlayerCount > 0) {
    warnings.push(`${ambiguousPlayerCount} maskeli telefon birden fazla üyeyle eşleşti.`)
  }

  return {
    importId,
    fileName,
    startDate,
    endDate,
    label,
    totalStake: roundMoney(parsedPlayers.reduce((sum, player) => sum + player.period.stake, 0)),
    totalRefunded: roundMoney(parsedPlayers.reduce((sum, player) => sum + player.period.refunded, 0)),
    totalCouponCount: hasCouponDetail
      ? parsedPlayers.reduce((sum, player) => sum + (player.period.couponCount ?? 0), 0)
      : null,
    playerCount: parsedPlayers.length,
    matchedPlayerCount: parsedPlayers.filter((player) => player.matchStatus === "matched").length,
    unmatchedPlayerCount: parsedPlayers.filter((player) => player.matchStatus === "unmatched").length,
    ambiguousPlayerCount,
    invalidTurnoverRows,
    invalidCouponRows,
    turnoverRowCount,
    couponRowCount,
    hasCouponDetail,
    warnings,
    players: parsedPlayers,
  }
}

const calculateSummary = (periods: TrackingPeriod[], days: TrackingDay[]): TrackingSummary => {
  const orderedPeriods = [...periods].sort((a, b) => a.endDate.localeCompare(b.endDate))
  const activeDays = days.filter((day) => day.stake > 0 || (day.couponCount ?? 0) > 0)
  const couponCoveragePeriods = periods.filter((period) => period.couponCount !== null).length
  const totalCouponCount = couponCoveragePeriods
    ? periods.reduce((sum, period) => sum + (period.couponCount ?? 0), 0)
    : null
  const totalStake = roundMoney(periods.reduce((sum, period) => sum + period.stake, 0))
  const peakPeriod = periods.reduce<TrackingPeriod | null>(
    (peak, period) => (!peak || period.stake > peak.stake ? period : peak),
    null,
  )
  const lastFour = orderedPeriods.slice(-4)
  const previousFour = orderedPeriods.slice(-8, -4)
  const lastFourPeriodsStake = roundMoney(lastFour.reduce((sum, period) => sum + period.stake, 0))
  const previousFourPeriodsStake = roundMoney(previousFour.reduce((sum, period) => sum + period.stake, 0))

  return {
    totalStake,
    totalRefunded: roundMoney(periods.reduce((sum, period) => sum + period.refunded, 0)),
    totalCouponCount,
    couponCoveragePeriods,
    activeDays: activeDays.length,
    activePeriods: periods.length,
    firstSeen: activeDays.map((day) => day.date).sort()[0] ?? orderedPeriods[0]?.startDate ?? null,
    lastSeen: activeDays.map((day) => day.date).sort().at(-1) ?? orderedPeriods.at(-1)?.endDate ?? null,
    peakPeriodLabel: peakPeriod?.label ?? null,
    peakPeriodStake: peakPeriod?.stake ?? 0,
    averageCouponAmount: totalCouponCount ? roundMoney(totalStake / totalCouponCount) : null,
    maxCouponAmount: couponCoveragePeriods
      ? Math.max(0, ...periods.map((period) => period.maxCouponAmount ?? 0))
      : null,
    lastFourPeriodsStake,
    previousFourPeriodsStake,
    trendPercent:
      previousFourPeriodsStake > 0
        ? roundMoney(((lastFourPeriodsStake - previousFourPeriodsStake) / previousFourPeriodsStake) * 100)
        : null,
  }
}

export const mergeTrackingPreviews = (
  previews: TrackingImportPreview[],
  memberSnapshotDay: string | null,
): TrackingPlayer[] => {
  const players = new Map<string, TrackingPlayer>()

  for (const preview of [...previews].sort((a, b) => a.startDate.localeCompare(b.startDate))) {
    for (const incoming of preview.players) {
      players.set(incoming.id, mergePlayer(players.get(incoming.id), incoming, memberSnapshotDay))
    }
  }

  return Array.from(players.values()).sort(
    (a, b) => b.summary.totalStake - a.summary.totalStake || a.id.localeCompare(b.id),
  )
}

const mergePlayer = (
  existing: TrackingPlayer | undefined,
  incoming: ParsedPlayer,
  memberSnapshotDay: string | null,
): TrackingPlayer => {
  const periods = [...(existing?.periods ?? []).filter((period) => period.importId !== incoming.period.importId), incoming.period]
    .sort((a, b) => a.startDate.localeCompare(b.startDate))
  const incomingDates = new Set(incoming.days.map((day) => day.date))
  const days = [...(existing?.days ?? []).filter((day) => !incomingDates.has(day.date)), ...incoming.days]
    .sort((a, b) => a.date.localeCompare(b.date))
  const matchedMemberId = incoming.memberId ?? existing?.memberId ?? null

  return {
    id: incoming.id,
    type: "player",
    signature: incoming.signature,
    maskedPhone: incoming.maskedPhone,
    memberId: matchedMemberId,
    matchStatus: incoming.matchStatus === "unmatched" && matchedMemberId ? "matched" : incoming.matchStatus,
    inCurrentMemberList: incoming.matchStatus === "matched",
    memberSnapshotDay,
    sourceImportIds: Array.from(new Set(periods.map((period) => period.importId))),
    periods,
    days,
    summary: calculateSummary(periods, days),
    updatedAt: serverTimestamp(),
  }
}

const rangesOverlap = (aStart: string, aEnd: string, bStart: string, bEnd: string): boolean =>
  aStart <= bEnd && bStart <= aEnd

export const saveTrackingImport = async (
  preview: TrackingImportPreview,
  memberSnapshotDay: string | null,
): Promise<void> => {
  const importRef = doc(db, SPECIAL_PLAYER_IMPORT_COLLECTION, preview.importId)
  const existingImport = await getDoc(importRef)
  if (existingImport.exists() && existingImport.data().status === "completed") {
    throw new Error("Bu Excel daha önce yüklenmiş. Dosya adı değişse bile aynı içerik tekrar kaydedilmez.")
  }

  const importSnapshot = await getDocs(collection(db, SPECIAL_PLAYER_IMPORT_COLLECTION))
  const overlapping = importSnapshot.docs.find((item) => {
    const data = item.data() as { startDate?: string; endDate?: string; status?: string }
    return (
      data.status === "completed" &&
      data.startDate &&
      data.endDate &&
      rangesOverlap(preview.startDate, preview.endDate, data.startDate, data.endDate)
    )
  })
  if (overlapping) {
    const data = overlapping.data() as { fileName?: string; startDate?: string; endDate?: string }
    throw new Error(
      `Bu tarih aralığı daha önce yüklendi: ${data.fileName ?? overlapping.id} (${formatIsoDate(data.startDate ?? null)} – ${formatIsoDate(data.endDate ?? null)}).`,
    )
  }

  await setDoc(importRef, {
    fileName: preview.fileName,
    startDate: preview.startDate,
    endDate: preview.endDate,
    label: preview.label,
    status: "processing",
    playerCount: preview.playerCount,
    totalStake: preview.totalStake,
    totalCouponCount: preview.totalCouponCount,
    hasCouponDetail: preview.hasCouponDetail,
    memberSnapshotDay,
    createdAt: serverTimestamp(),
  })

  try {
    const existingPlayersSnapshot = await getDocs(collection(db, SPECIAL_PLAYER_COLLECTION))
    const existingPlayers = new Map(
      existingPlayersSnapshot.docs.map((item) => [item.id, item.data() as TrackingPlayer]),
    )
    const mergedPlayers = preview.players.map((player) =>
      mergePlayer(existingPlayers.get(player.id), player, memberSnapshotDay),
    )

    const batchSize = 350
    for (let start = 0; start < mergedPlayers.length; start += batchSize) {
      const batch = writeBatch(db)
      for (const player of mergedPlayers.slice(start, start + batchSize)) {
        batch.set(doc(db, SPECIAL_PLAYER_COLLECTION, player.id), player)
      }
      await batch.commit()
    }

    await setDoc(
      importRef,
      {
        status: "completed",
        completedAt: serverTimestamp(),
      },
      { merge: true },
    )
  } catch (error) {
    await setDoc(
      importRef,
      {
        status: "failed",
        failedAt: serverTimestamp(),
        errorMessage: error instanceof Error ? error.message : String(error),
      },
      { merge: true },
    )
    throw error
  }
}

export const subscribeTrackingPlayers = (
  onData: (players: TrackingPlayer[]) => void,
  onError: (error: Error) => void,
): Unsubscribe => {
  const playersQuery = query(collection(db, SPECIAL_PLAYER_COLLECTION), orderBy("summary.totalStake", "desc"))
  return onSnapshot(
    playersQuery,
    (snapshot) => onData(snapshot.docs.map((item) => item.data() as TrackingPlayer)),
    (error) => onError(error),
  )
}

export const subscribeTrackingImports = (
  onData: (imports: TrackingImportRecord[]) => void,
  onError: (error: Error) => void,
): Unsubscribe => {
  const importsQuery = query(collection(db, SPECIAL_PLAYER_IMPORT_COLLECTION), orderBy("startDate", "asc"))
  return onSnapshot(
    importsQuery,
    (snapshot) =>
      onData(
        snapshot.docs.map((item) => ({
          id: item.id,
          ...(item.data() as Omit<TrackingImportRecord, "id">),
        })),
      ),
    (error) => onError(error),
  )
}
