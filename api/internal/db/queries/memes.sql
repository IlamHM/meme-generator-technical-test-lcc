-- name: ListMemesByUser :many
SELECT * FROM memes WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3;

-- name: CountMemesByUser :one
SELECT COUNT(*) FROM memes WHERE user_id = $1;

-- name: GetMemeByID :one
SELECT * FROM memes WHERE id = $1 AND user_id = $2;

-- name: DeleteMeme :exec
DELETE FROM memes WHERE id = $1 AND user_id = $2;

-- name: SetMemeResultURL :one
UPDATE memes SET result_url = $3
WHERE id = $1 AND user_id = $2
RETURNING *;
