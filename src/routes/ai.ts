import { Hono } from 'hono';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { db, schema } from '../db/index.js';
import { eq, and } from 'drizzle-orm';
import { randomUUID } from 'crypto';

export const aiRouter = new Hono();
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? '');

const PRIORITY_LABELS: Record<string, string> = { high: '高（最優先）', medium: '中（通常）', low: '低（余裕があれば）' };

aiRouter.post('/generate-schedule', async (c) => {
  const { year, month } = await c.req.json();

  const employees = await db.select().from(schema.employees);
  const [bh] = await db.select().from(schema.businessHours);
  const requests = await db.select().from(schema.shiftRequests).where(
    and(eq(schema.shiftRequests.year, year), eq(schema.shiftRequests.month, month))
  );

  const employeeData = employees.map(emp => ({
    id: emp.id,
    name: emp.name,
    type: emp.type,
    hourlyWage: emp.hourlyWage,
    priority: emp.priority,
    priorityLabel: PRIORITY_LABELS[emp.priority] ?? '中',
    requests: requests.filter(r => r.employeeId === emp.id).map(r => ({
      day: r.day, available: r.isAvailable, startTime: r.startTime, endTime: r.endTime, note: r.note,
    })),
  }));

  const minStaff = bh?.minStaff ?? 1;

  const prompt = `あなたはシフト管理の専門家です。以下の条件に基づいて${year}年${month}月のシフト表を作成してください。

## 営業時間
開店: ${bh?.openTime ?? '09:00'}  閉店: ${bh?.closeTime ?? '21:00'}
ロングシフト基準: ${bh?.longShiftThreshold ?? 6}時間以上
最低同時勤務人数: ${minStaff}人（営業開始から営業終了まで、常に${minStaff}人以上が同時に勤務している状態を維持すること）

## 従業員データ（優先度順に配置）
${JSON.stringify(employeeData, null, 2)}

## ルール（上から順に厳守）
1. available=false の日は絶対に入れない
2. 営業開始（${bh?.openTime ?? '09:00'}）から営業終了（${bh?.closeTime ?? '21:00'}）まで、どの時点においても必ず${minStaff}人以上が同時に勤務していること。途中で人数が${minStaff}人を下回る時間帯が生じてはならない
3. 優先度「高」の従業員から先にシフトを埋める。優先度「低」は他に人員が足りているときのみ追加する
4. シフトは営業時間内のみ（開店〜閉店）
5. インターン・パートの月収: 30,000〜50,000円（時給${employees[0]?.hourlyWage ?? 1173}円） → 月25.6〜42.6時間
6. 契約社員はロング（${bh?.longShiftThreshold ?? 6}時間以上）優先
7. 希望のstartTime/endTimeがある場合はそれを使用
8. noteを考慮する

## 出力形式（JSONのみ、説明文・マークダウン不要）
{"slots":[{"employeeId":"...","date":"YYYY-MM-DD","startTime":"HH:MM","endTime":"HH:MM","note":"任意"}]}`;

  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
  const result = await model.generateContent(prompt);
  const text = result.response.text();

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('No JSON in AI response');
  const { slots } = JSON.parse(jsonMatch[0]);

  // 既存スケジュール削除
  const existing = await db.select().from(schema.schedules).where(
    and(eq(schema.schedules.year, year), eq(schema.schedules.month, month))
  );
  for (const s of existing) {
    await db.delete(schema.schedules).where(eq(schema.schedules.id, s.id));
  }

  // 新規保存
  const now = new Date().toISOString();
  const scheduleId = randomUUID();
  await db.insert(schema.schedules).values({ id: scheduleId, year, month, status: 'draft', createdAt: now, updatedAt: now });

  for (const slot of slots) {
    await db.insert(schema.scheduleSlots).values({
      id: randomUUID(), scheduleId,
      employeeId: slot.employeeId, date: slot.date,
      startTime: slot.startTime, endTime: slot.endTime,
      note: slot.note ?? null, createdAt: now, updatedAt: now,
    });
  }

  const [schedule] = await db.select().from(schema.schedules).where(eq(schema.schedules.id, scheduleId));
  const savedSlots = await db.select().from(schema.scheduleSlots).where(eq(schema.scheduleSlots.scheduleId, scheduleId));
  return c.json({ ...schedule, slots: savedSlots }, 201);
});
