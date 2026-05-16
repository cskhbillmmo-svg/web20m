-- create-admin.sql
-- Chạy trong Supabase SQL Editor
-- 1) Tạo user bằng giao diện đăng ký (register.html) với username và mật khẩu bạn muốn.
-- 2) Sau khi user tạo xong, dùng tên đăng nhập đó để gán role admin.

-- Kiểm tra user đã tồn tại:
-- select id, username, created_at from public.profiles where username = 'admin_username';

-- Gán role admin cho user đã có:
update public.profiles
set role = 'admin'
where username = 'admin_username';

-- Nếu bạn muốn dùng trực tiếp user id, thay bằng id thực:
-- update public.profiles
-- set role = 'admin'
-- where id = '00000000-0000-0000-0000-000000000000';

-- Sau khi chạy, user đó sẽ đăng nhập được vào admin.html.
