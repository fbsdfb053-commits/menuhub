-- Controle de estoque por restaurante. Itens só entram no controle quando o dono informa a quantidade inicial.
create table if not exists public.inventory_stock (
 id bigserial primary key, empresa_id integer not null references public.empresas(id) on delete cascade,
 item_type text not null check(item_type in ('product','complement')), item_id integer not null,
 quantity numeric(12,3) not null default 0 check(quantity>=0),
 minimum_quantity numeric(12,3) not null default 0 check(minimum_quantity>=0),
 unit text not null default 'un', updated_at timestamptz not null default now(),
 unique(empresa_id,item_type,item_id)
);
create table if not exists public.inventory_movements (
 id bigserial primary key, empresa_id integer not null references public.empresas(id) on delete cascade,
 stock_id bigint not null references public.inventory_stock(id) on delete cascade,
 movement_type text not null check(movement_type in ('entry','exit','sale','sale_return','adjustment')),
 quantity numeric(12,3) not null check(quantity>0), previous_quantity numeric(12,3) not null,
 new_quantity numeric(12,3) not null, note text, pedido_id integer references public.pedidos(id) on delete set null,
 created_at timestamptz not null default now(), created_by uuid default auth.uid()
);
create table if not exists public.inventory_order_deductions (
 id bigserial primary key, pedido_id integer not null references public.pedidos(id) on delete cascade,
 stock_id bigint not null references public.inventory_stock(id) on delete cascade,
 quantity numeric(12,3) not null check(quantity>0), reversed_at timestamptz,
 unique(pedido_id,stock_id)
);
alter table public.itens_pedido add column if not exists complement_option_ids integer[] not null default '{}';
alter table public.inventory_stock enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.inventory_order_deductions enable row level security;
drop policy if exists inventory_stock_owner_all on public.inventory_stock;
create policy inventory_stock_owner_all on public.inventory_stock for all to authenticated
 using(exists(select 1 from public.empresas e where e.id=empresa_id and e.dono_id=auth.uid()))
 with check(exists(select 1 from public.empresas e where e.id=empresa_id and e.dono_id=auth.uid()));
drop policy if exists inventory_movements_owner_select on public.inventory_movements;
create policy inventory_movements_owner_select on public.inventory_movements for select to authenticated
 using(exists(select 1 from public.empresas e where e.id=empresa_id and e.dono_id=auth.uid()));
drop policy if exists inventory_deductions_owner_select on public.inventory_order_deductions;
create policy inventory_deductions_owner_select on public.inventory_order_deductions for select to authenticated
 using(exists(select 1 from public.pedidos p join public.empresas e on e.id=p.empresa_id where p.id=pedido_id and e.dono_id=auth.uid()));

create or replace function public.inventory_adjust_stock(p_stock_id bigint,p_delta numeric,p_movement_type text,p_note text default null)
returns numeric language plpgsql security definer set search_path=public as $$
declare v_stock public.inventory_stock%rowtype; v_new numeric(12,3);
begin
 if auth.uid() is null then raise exception 'Faça login para movimentar o estoque.'; end if;
 if p_delta=0 or p_movement_type not in ('entry','exit','adjustment') then raise exception 'Movimentação inválida.'; end if;
 select s.* into v_stock from public.inventory_stock s join public.empresas e on e.id=s.empresa_id
 where s.id=p_stock_id and e.dono_id=auth.uid() for update;
 if not found then raise exception 'Item de estoque não encontrado.'; end if;
 v_new:=v_stock.quantity+p_delta; if v_new<0 then raise exception 'Quantidade insuficiente em estoque.'; end if;
 update public.inventory_stock set quantity=v_new,updated_at=now() where id=p_stock_id;
 insert into public.inventory_movements(empresa_id,stock_id,movement_type,quantity,previous_quantity,new_quantity,note)
 values(v_stock.empresa_id,p_stock_id,p_movement_type,abs(p_delta),v_stock.quantity,v_new,nullif(trim(coalesce(p_note,'')),''));
 return v_new;
end $$;
revoke all on function public.inventory_adjust_stock(bigint,numeric,text,text) from public;
grant execute on function public.inventory_adjust_stock(bigint,numeric,text,text) to authenticated;

-- O pedido digital guarda também os IDs dos complementos escolhidos, para permitir baixa correta.
do $$
declare v_def text;
begin
 v_def:=pg_get_functiondef('public.criar_pedido(text,text,text,text,text,jsonb,text,text,boolean,numeric)'::regprocedure);
 v_def:=replace(v_def,'insert into public.itens_pedido(pedido_id,produto_id,nome_produto,quantidade,preco_unitario)','insert into public.itens_pedido(pedido_id,produto_id,nome_produto,quantidade,preco_unitario,complement_option_ids)');
 v_def:=replace(v_def,'values(v_pedido_id,v_prod.id,case when v_names<>'''' then v_prod.nome||'' (''||v_names||'')'' else v_prod.nome end,v_qtd,v_unit);','values(v_pedido_id,v_prod.id,case when v_names<>'''' then v_prod.nome||'' (''||v_names||'')'' else v_prod.nome end,v_qtd,v_unit,coalesce((select array_agg((x->>''id'')::int) from jsonb_array_elements(coalesce(v_item->''complementos'',''[]''::jsonb)) x), ''{}''::integer[]));');
 if position('array_agg' in v_def)=0 then raise exception 'Falha ao atualizar a gravação dos complementos.'; end if;
 execute v_def;
end $$;

create or replace function public.inventory_handle_order_status()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_req record; v_stock public.inventory_stock%rowtype; v_new numeric(12,3);
begin
 if new.status is not distinct from old.status then return new; end if;
 if lower(coalesce(new.status,'')) in ('aceito','preparando','pronto','em entrega','retirada disponível','concluído') then
  for v_req in
   select x.stock_id,sum(x.qty)::numeric(12,3) total_qty from (
    select s.id stock_id,ip.quantidade::numeric qty from public.itens_pedido ip
    join public.inventory_stock s on s.empresa_id=new.empresa_id and s.item_type='product' and s.item_id=ip.produto_id
    where ip.pedido_id=new.id and ip.produto_id is not null
    union all
    select s.id stock_id,ip.quantidade::numeric qty from public.itens_pedido ip
    cross join lateral unnest(coalesce(ip.complement_option_ids,'{}'::integer[])) opt(option_id)
    join public.inventory_stock s on s.empresa_id=new.empresa_id and s.item_type='complement' and s.item_id=opt.option_id
    where ip.pedido_id=new.id
   ) x group by x.stock_id
  loop
   if exists(select 1 from public.inventory_order_deductions d where d.pedido_id=new.id and d.stock_id=v_req.stock_id and d.reversed_at is null) then continue; end if;
   select * into v_stock from public.inventory_stock where id=v_req.stock_id for update;
   if v_stock.quantity<v_req.total_qty then raise exception 'Estoque insuficiente para um dos itens (disponível: %, pedido: %).',v_stock.quantity,v_req.total_qty; end if;
   v_new:=v_stock.quantity-v_req.total_qty;
   update public.inventory_stock set quantity=v_new,updated_at=now() where id=v_stock.id;
   insert into public.inventory_order_deductions(pedido_id,stock_id,quantity) values(new.id,v_stock.id,v_req.total_qty)
   on conflict(pedido_id,stock_id) do update set quantity=excluded.quantity,reversed_at=null;
   insert into public.inventory_movements(empresa_id,stock_id,movement_type,quantity,previous_quantity,new_quantity,note,pedido_id)
   values(new.empresa_id,v_stock.id,'sale',v_req.total_qty,v_stock.quantity,v_new,'Venda do pedido #'||new.id,new.id);
  end loop;
 elsif lower(coalesce(new.status,''))='cancelado' then
  for v_req in select d.id,d.stock_id,d.quantity,s.empresa_id,s.quantity current_quantity
   from public.inventory_order_deductions d join public.inventory_stock s on s.id=d.stock_id
   where d.pedido_id=new.id and d.reversed_at is null for update of s
  loop
   v_new:=v_req.current_quantity+v_req.quantity;
   update public.inventory_stock set quantity=v_new,updated_at=now() where id=v_req.stock_id;
   update public.inventory_order_deductions set reversed_at=now() where id=v_req.id;
   insert into public.inventory_movements(empresa_id,stock_id,movement_type,quantity,previous_quantity,new_quantity,note,pedido_id)
   values(v_req.empresa_id,v_req.stock_id,'sale_return',v_req.quantity,v_req.current_quantity,v_new,'Devolução por cancelamento do pedido #'||new.id,new.id);
  end loop;
 end if;
 return new;
end $$;
drop trigger if exists inventory_order_status_trigger on public.pedidos;
create trigger inventory_order_status_trigger after update of status on public.pedidos
for each row execute function public.inventory_handle_order_status();
create index if not exists inventory_movements_empresa_created_idx on public.inventory_movements(empresa_id,created_at desc);
create index if not exists inventory_deductions_order_idx on public.inventory_order_deductions(pedido_id);
