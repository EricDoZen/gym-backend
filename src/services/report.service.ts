import { sql } from 'drizzle-orm'
import { getDb } from '../db/client.js'

function numberValue(value: unknown) {
  return Number(value ?? 0)
}

function resultRows(result: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(result)) return result as Array<Record<string, unknown>>
  const rows = (result as { rows?: unknown } | null)?.rows
  return Array.isArray(rows) ? rows as Array<Record<string, unknown>> : []
}

export async function getOperationsReport(from: string, to: string) {
  const db = getDb()
  const [revenueRows, memberRows, trialRows, checkinRows, expiryRows, methodRows, packageRows, trainerRows] = await Promise.all([
    db.execute(sql`
      SELECT
        COALESCE(SUM(CASE WHEN p.status='Paid' THEN p.amount_mmk ELSE 0 END),0) AS gross_revenue,
        COALESCE((SELECT SUM(pa.amount_mmk) FROM payment_adjustments pa
          INNER JOIN payments p2 ON p2.id=pa.payment_id
          WHERE p2.payment_date BETWEEN ${from} AND ${to}),0) AS adjustments
      FROM payments p
      WHERE p.payment_date BETWEEN ${from} AND ${to}
    `),
    db.execute(sql`
      SELECT
        COUNT(*) AS new_members,
        SUM(CASE WHEN status='Active' AND expire_date >= CURDATE() THEN 1 ELSE 0 END) AS active_members
      FROM members
      WHERE join_date BETWEEN ${from} AND ${to}
    `),
    db.execute(sql`
      SELECT COUNT(*) AS trials,
        SUM(CASE WHEN converted_member_id IS NOT NULL THEN 1 ELSE 0 END) AS converted
      FROM trial_registrations
      WHERE DATE(created_at) BETWEEN ${from} AND ${to}
    `),
    db.execute(sql`
      SELECT COUNT(*) AS total FROM checkins
      WHERE DATE(checked_in_at) BETWEEN ${from} AND ${to}
    `),
    db.execute(sql`
      SELECT
        SUM(CASE WHEN status='Active' AND expire_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 7 DAY) THEN 1 ELSE 0 END) AS expiring_7,
        SUM(CASE WHEN status='Active' AND expire_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 30 DAY) THEN 1 ELSE 0 END) AS expiring_30
      FROM members
    `),
    db.execute(sql`
      SELECT payment_method AS label, SUM(amount_mmk) AS amount, COUNT(*) AS count
      FROM payments
      WHERE status='Paid' AND payment_date BETWEEN ${from} AND ${to}
      GROUP BY payment_method ORDER BY amount DESC
    `),
    db.execute(sql`
      SELECT package_name AS label, COUNT(*) AS count, SUM(amount_mmk) AS amount
      FROM payments
      WHERE status='Paid' AND payment_date BETWEEN ${from} AND ${to}
      GROUP BY package_name ORDER BY count DESC
    `),
    db.execute(sql`
      SELECT t.id, t.full_name AS name,
        SUM(CASE WHEN b.status IN ('Completed','NoShow','Booked') THEN 1 ELSE 0 END) AS sessions,
        SUM(CASE WHEN b.status='Completed' THEN 1 ELSE 0 END) AS completed,
        SUM(CASE WHEN b.status='NoShow' THEN 1 ELSE 0 END) AS no_show
      FROM trainers t
      LEFT JOIN bookings b ON b.trainer_id=t.id AND DATE(b.scheduled_at) BETWEEN ${from} AND ${to}
      GROUP BY t.id,t.full_name ORDER BY sessions DESC
    `),
  ])

  const revenue = resultRows(revenueRows)[0] ?? {}
  const members = resultRows(memberRows)[0] ?? {}
  const trials = resultRows(trialRows)[0] ?? {}
  const checkins = resultRows(checkinRows)[0] ?? {}
  const expiry = resultRows(expiryRows)[0] ?? {}
  const grossRevenue = numberValue(revenue.gross_revenue)
  const adjustments = numberValue(revenue.adjustments)
  const trialCount = numberValue(trials.trials)
  const converted = numberValue(trials.converted)

  return {
    from,
    to,
    revenue: {
      gross: grossRevenue,
      adjustments,
      net: Math.max(0, grossRevenue - adjustments),
    },
    members: {
      new: numberValue(members.new_members),
      activeJoinedInRange: numberValue(members.active_members),
      expiring7Days: numberValue(expiry.expiring_7),
      expiring30Days: numberValue(expiry.expiring_30),
    },
    trials: {
      total: trialCount,
      converted,
      conversionRate: trialCount > 0 ? Math.round((converted / trialCount) * 10000) / 100 : 0,
    },
    attendance: { checkins: numberValue(checkins.total) },
    paymentMethods: resultRows(methodRows).map((row) => ({
      label: String(row.label ?? 'Unknown'),
      amount: numberValue(row.amount),
      count: numberValue(row.count),
    })),
    packages: resultRows(packageRows).map((row) => ({
      label: String(row.label ?? 'Unknown'),
      amount: numberValue(row.amount),
      count: numberValue(row.count),
    })),
    trainers: resultRows(trainerRows).map((row) => ({
      id: String(row.id),
      name: String(row.name ?? ''),
      sessions: numberValue(row.sessions),
      completed: numberValue(row.completed),
      noShow: numberValue(row.no_show),
    })),
  }
}
