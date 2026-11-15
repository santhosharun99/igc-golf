-- FAKE sample data for India Golf Carnival 2026-27.
-- Every name, mobile number and email is made up (emails use example.com).
-- Re-runnable: wipes and regenerates. Deterministic via setseed.
truncate public.scores, public.participants, public.cities restart identity cascade;

insert into public.cities (id,name,sort_order,start_date,end_date,status,handicap_method,team,is_final,venue) values
 (1,'Delhi',1,'2026-10-08','2026-10-08','completed','super36','Himanti, Archita, Rohit, Naresh',false,'Qutab Golf Course'),
 (2,'Bhopal',2,'2026-12-03','2026-12-06','upcoming','registered','KK, Mayank, Himanti, Muskan, Aarav',false,'Army Golf Course'),
 (3,'Ahmedabad',3,'2026-12-25','2026-12-28','upcoming','super36','KK, Tanya, Muskan, Ankit',false,'Kalhaar Blues & Greens'),
 (4,'Vizag',4,'2027-01-14','2027-01-16','upcoming','registered','KK, Himanti, Mayank, Santhosh',false,'East Point Golf Club'),
 (5,'Jaipur',5,'2027-02-12','2027-02-14','upcoming','super36','KK, Himanti, Abhay, Santhosh',false,'Sapta Shakti Golf Course'),
 (6,'Jamshedpur',6,'2027-03-12','2027-03-14','upcoming','registered','KK, Tanya, Muskan, Mayank',false,'Beldih Golf Course'),
 (7,'Bengaluru',7,'2027-03-27','2027-03-30','upcoming','registered','KK, Himanti, Muskan, Santhosh',false,'To be announced'),
 (8,'Srinagar',8,'2027-04-23','2027-04-27','upcoming','super36','KK, Tanya, Muskan',false,'Royal Springs Golf Course'),
 (9,'Almaty (Grand Finale)',9,'2027-06-01','2027-06-30','upcoming','tbc','',true,'Nurtau Golf Club or Zhailjau Golf Resort (TBC)');

do $$
declare
  fm text[] := array['Aarav','Vikram','Rohan','Arjun','Karan','Rahul','Siddharth','Aditya','Nikhil','Varun','Amit','Rajiv','Sanjay','Manish','Harsh','Kunal','Pranav','Gaurav','Ishaan','Yash','Dev','Abhishek','Ankur','Deepak','Sameer','Tarun','Vivek','Kabir','Raghav','Naveen','Suresh','Anand','Mohit','Sahil','Ritesh','Arnav'];
  ff text[] := array['Ananya','Priya','Kavya','Meera','Nisha','Riya','Sneha','Aditi','Pooja','Tara','Ishita','Neha','Shreya','Divya','Radhika','Sanya','Aisha','Gauri','Jahnvi','Simran'];
  lnames text[] := array['Sharma','Verma','Mehta','Kapoor','Malhotra','Singh','Gupta','Agarwal','Bansal','Khanna','Reddy','Rao','Nair','Iyer','Menon','Patel','Shah','Desai','Joshi','Kulkarni','Chopra','Sethi','Bhatia','Arora','Chatterjee','Banerjee','Das','Mishra','Pandey','Saxena','Jain','Goyal','Kaul','Dhar','Wani','Naidu'];
  other text[] := array['Royal Calcutta Golf Club','Bombay Presidency Golf Club','Chandigarh Golf Club','Hyderabad Golf Club','DLF Golf & Country Club','Karnataka Golf Association','Tollygunge Club','Delhi Golf Club'];
  counts int[] := array[104,98,101,96,103,94,107,92];
  locals jsonb := '{
    "1":["Delhi Golf Club","DLF Golf & Country Club","Qutab Golf Course","Army Golf Course","Noida Golf Course","Classic Golf & Country Club","Jaypee Greens Golf Course","Golden Greens Golf Club"],
    "2":["Army Golf Course","Delhi Golf Club","Noida Golf Course"],
    "3":["Kalhaar Blues & Greens","Gulmohar Greens Golf & Country Club"],
    "4":["East Point Golf Club","Hyderabad Golf Club","Boulder Hills Golf Club"],
    "5":["Rambagh Golf Club","Sapta Shakti Golf Course","Classic Golf & Country Club"],
    "6":["Beldih Golf Course","Golmuri Golf Course","Tollygunge Club"],
    "7":["Karnataka Golf Association","Bangalore Golf Club","Eagleton Golf Resort","Prestige Golfshire"],
    "8":["Royal Springs Golf Course","Kashmir Golf Club"]}';
  c int; i int; fem boolean; f text; l text; em text; k int; club text; hcp numeric; pid bigint;
  meth text; g int; pars int; bir int; eag int; hc int; lam float; pl float; pp float;
begin
  perform setseed(0.2026);
  for c in 1..8 loop
    select handicap_method into meth from public.cities where id = c;
    for i in 1..counts[c] loop
      fem := random() < 0.18;
      f := case when fem then ff[1 + floor(random()*array_length(ff,1))::int] else fm[1 + floor(random()*array_length(fm,1))::int] end;
      l := lnames[1 + floor(random()*array_length(lnames,1))::int];
      em := lower(f||'.'||l)||'@example.com'; k := 2;
      while exists (select 1 from public.participants where email = em) loop
        em := lower(f||'.'||l)||k||'@example.com'; k := k + 1;
      end loop;
      if random() < 0.7 then
        club := (locals->(c::text))->>floor(random()*jsonb_array_length(locals->(c::text)))::int;
      else
        club := other[1 + floor(random()*array_length(other,1))::int];
      end if;
      hcp := round(least(36, greatest(0, 17 + 7.5*sqrt(-2*ln(1-random()))*cos(2*pi()*random())))::numeric, 1);
      insert into public.participants (city_id, full_name, gender, mobile, email, home_club, handicap_index)
      values (c, f||' '||l, case when fem then 'F' else 'M' end,
              '+91 70000 '||(10000 + floor(random()*90000))::int, em, club, hcp)
      returning id into pid;

      if c = 1 then  -- only Delhi has been played
        g := round(72 + hcp*1.05 + 3.2*sqrt(-2*ln(1-random()))*cos(2*pi()*random()));
        pars := greatest(0, least(18, round(18*greatest(0.04, 0.78 - hcp*0.02) + 1.6*sqrt(-2*ln(1-random()))*cos(2*pi()*random()))))::int;
        lam := greatest(0.08, 2.6 - hcp*0.11); pl := exp(-lam); pp := 1; bir := -1;
        loop pp := pp*random(); bir := bir + 1; exit when pp <= pl; end loop;
        bir := least(18 - pars, bir);
        eag := case when random() < greatest(0, 0.05 - hcp*0.002) then 1 else 0 end;
        hc := case when meth = 'super36' then greatest(0, 36 - (pars + 2*bir + 3*eag))
                   else round(hcp*125/113)::int end;
        insert into public.scores (participant_id, city_id, gross, pars, birdies, eagles, handicap_applied, net)
        values (pid, c, g, pars, bir, eag, hc, g - hc);
      end if;
    end loop;
  end loop;
end $$;

-- Make every player name unique across all cities (a player belongs to exactly one city leg)
do $$
declare
  fm text[] := array['Aarav','Vikram','Rohan','Arjun','Karan','Rahul','Siddharth','Aditya','Nikhil','Varun','Amit','Rajiv','Sanjay','Manish','Harsh','Kunal','Pranav','Gaurav','Ishaan','Yash','Dev','Abhishek','Ankur','Deepak','Sameer','Tarun','Vivek','Kabir','Raghav','Naveen','Suresh','Anand','Mohit','Sahil','Ritesh','Arnav','Rishabh','Kartik','Akash','Neeraj','Puneet','Shaurya','Vihaan','Ayaan','Rudra','Ojas'];
  ff text[] := array['Ananya','Priya','Kavya','Meera','Nisha','Riya','Sneha','Aditi','Pooja','Tara','Ishita','Neha','Shreya','Divya','Radhika','Sanya','Aisha','Gauri','Jahnvi','Simran','Tanvi','Mira','Avni','Kiara'];
  lnames text[] := array['Sharma','Verma','Mehta','Kapoor','Malhotra','Singh','Gupta','Agarwal','Bansal','Khanna','Reddy','Rao','Nair','Iyer','Menon','Patel','Shah','Desai','Joshi','Kulkarni','Chopra','Sethi','Bhatia','Arora','Chatterjee','Banerjee','Das','Mishra','Pandey','Saxena','Jain','Goyal','Kaul','Dhar','Wani','Naidu','Bose','Thakur','Grover','Ahuja','Mathur','Sinha','Trivedi','Bhat'];
  r record; nm text; f text;
begin
  perform setseed(0.77);
  for r in select p.id, p.gender from public.participants p
           where exists (select 1 from public.participants q where q.full_name = p.full_name and q.id < p.id)
           order by p.id loop
    loop
      f := case when r.gender='F' then ff[1+floor(random()*array_length(ff,1))::int] else fm[1+floor(random()*array_length(fm,1))::int] end;
      nm := f||' '||lnames[1+floor(random()*array_length(lnames,1))::int];
      exit when not exists (select 1 from public.participants where full_name = nm);
    end loop;
    update public.participants set full_name = nm where id = r.id;
  end loop;
  update public.participants set email = lower(replace(full_name,' ','.'))||'@example.com';
end $$;

-- Registration opens one city at a time: Delhi closed (played), Bhopal open (partial), the rest not open
update public.cities set registration_status = 'closed' where id = 1;
update public.cities set registration_status = 'open' where id = 2;
delete from public.participants
where city_id between 3 and 8
   or (city_id = 2 and id not in (select id from public.participants where city_id = 2 order by id limit 45));

-- Delhi (Qutab) sample layout, par 72, and a fake 18-hole card per Delhi player that
-- reconciles exactly with scores.gross / pars / birdies / eagles
insert into public.holes (city_id, hole, par, stroke_index)
select 1, h, (array[4,4,3,5,4,4,3,4,5, 4,3,4,5,4,4,3,5,4])[h], (array[7,3,15,11,1,9,17,5,13, 8,16,2,12,6,10,18,14,4])[h]
from generate_series(1,18) h;
update public.scores set pars = 18 - birdies - eagles,
  handicap_applied = greatest(0, 36 - ((18 - birdies - eagles) + 2*birdies + 3*eagles))
where pars + birdies + eagles > 18;
update public.scores set gross = 72 - birdies - 2*eagles
  + least(greatest(gross - 72 + birdies + 2*eagles, 18 - pars - birdies - eagles), 6*(18 - pars - birdies - eagles));
update public.scores set net = gross - handicap_applied;
do $$
declare
  pars_arr int[] := array[4,4,3,5,4,4,3,4,5, 4,3,4,5,4,4,3,5,4];
  r record; kind text[]; diff int[]; idx int[]; i int; over int; rest int[]; extra int; pick int;
begin
  perform setseed(0.18);
  for r in select * from public.scores order by participant_id loop
    kind := array_fill('bad'::text, array[18]);
    select array_agg(h order by random()) into idx from generate_series(1,18) h where pars_arr[h] = 5;
    for i in 1..r.eagles loop kind[idx[i]] := 'eagle'; end loop;
    select array_agg(h order by random()) into idx from generate_series(1,18) h where kind[h] = 'bad';
    for i in 1..r.birdies loop kind[idx[i]] := 'birdie'; end loop;
    for i in r.birdies+1 .. r.birdies + r.pars loop kind[idx[i]] := 'par'; end loop;
    diff := array_fill(0, array[18]); rest := '{}';
    for i in 1..18 loop
      if kind[i] = 'eagle' then diff[i] := -2; elsif kind[i] = 'birdie' then diff[i] := -1;
      elsif kind[i] = 'par' then diff[i] := 0; else diff[i] := 1; rest := rest || i; end if;
    end loop;
    over := r.gross - 72 + r.birdies + 2*r.eagles;
    extra := over - coalesce(array_length(rest,1),0);
    while extra > 0 loop
      pick := rest[1 + floor(random()*array_length(rest,1))::int];
      if diff[pick] < 6 then diff[pick] := diff[pick] + 1; extra := extra - 1; end if;
    end loop;
    insert into public.hole_scores (participant_id, hole, strokes)
    select r.participant_id, h, pars_arr[h] + diff[h] from generate_series(1,18) h;
  end loop;
end $$;
