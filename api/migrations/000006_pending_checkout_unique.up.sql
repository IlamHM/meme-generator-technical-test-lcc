-- TKT-105: cegah lebih dari satu checkout pending per (user, plan).
-- Idempotency-Key saja tidak cukup karena klien bisa mengirim key baru di
-- setiap klik (double-click pada koneksi lambat). Unique partial index ini
-- adalah safety net DB; service mengubah konflik menjadi "reuse checkout
-- yang sudah ada" agar respons tetap idempotent per user+plan.
CREATE UNIQUE INDEX subscriptions_user_plan_pending_idx
  ON subscriptions (user_id, plan_id)
  WHERE status = 'pending';
