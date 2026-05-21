import { Hono } from 'hono';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { db, schema } from '../db/index.js';
import { eq, and } from 'drizzle-orm';
import { randomUUID } from 'crypto';

export const aiRouter = new Hono();
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? '');

aiRouter.post('/generate-schedule', async (c) => {
  const { year, month } = await c.req.json();

  const employees = await db.select().from(schema.employees);
  const [bh] = await db.select().from(schema.businessHours);
  const requests = await db.select().from(schema.shiftRequests).where(
    and(eq(schema.shiftRequests.year, year), eq(schema.shiftRequests.month, month))
  );

  const employeeData = employees.map(emp => ({
    id: emp.id, name: emp.name, type: emp.type, hourlyWage: emp.hourlyWage,
    requests: requests.filter(r => r.employeeId === emp.id).map(r => ({
      day: r.day, available: r.isAvailable, startTime: r.startTime, endTime: r.endTime, note: r.note,
    })),
  }));

  const prompt = `あなたはシフト管理の専門家です。以下の条件に基づいて${year}年${month}月のシフト表を作成してください。

## 営業時間
開店: ${bh?.openTime ?? '09:00'}  閉店: ${bh?.closeTime ?? '21:00'}
ロングシフト基準: ${bh?.longShiftThreshold ?? 6}時間以上

## 従業員データ
${JSON.stringify(employeeData, null, 2)}

## ルール
1. シフトは営業時間内のみ
2. インターン・パートの月収: 30,000〜50,000円（時給1,173円） → 月25.6〜42.6時間
3. 契約社員はロング（${bh?.longShiftThreshold ?? 6}時間以上）優先
4. available=false の日は絶対に入れない
5. 希望のstartTime/endTimeがある場合はそれを使用
6. noteを考慮する
7. 各日に少なくとも1人配置

## 出力形式（JSONのみ、説明不要）
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
