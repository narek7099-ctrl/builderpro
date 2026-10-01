/* Per-trade question sets for the Health checker and the Damage checker.
   Built into embed/health-<trade>.html and embed/damage-<trade>.html by
   tools/build-checkers.py — edit here, not in embed/.

   health.qs[]   one question per screen. Each option is
                 [label, points off the 100, what this answer means]
   cost          default rough ranges in USD, used for the result's estimate.
                 maint = tune-up / small fix, repair = real repair,
                 major = replacement / big job. An owner can override any of
                 them in their calculator pricing row (pricing.checker).
   damage.where  where the damage is; each option names the damage type the
                 rules engine assumes when the photo scan isn't available.
*/
var CK_TRADES = {
roofing:{name:'Roofing',noun:'roof',
  cost:{maint:[250,650],repair:[450,1900],major:[9500,22000]},
  health:{title:'Roof Health Check',qs:[
    {id:'age',q:'How old is your roof?',hint:'Your best guess is fine.',opts:[['Under 8 years',0,'Young roof — most of its life is ahead of it.'],['8–15 years',10,'Mid-life — a good time for an inspection.'],['15–22 years',28,'Late life for shingles — plan ahead.'],['Over 22 years',42,'Past the typical lifespan of an asphalt roof.'],['Not sure',14,'Unknown age — we assume mid-life until inspected.']]},
    {id:'mat',q:'What is it made of?',opts:[['Asphalt shingles',0,'Asphalt shingles typically last 20–25 years.'],['Metal',-6,'Metal roofs last 40+ years.'],['Tile',-6,'Tile roofs last 50 years, but underlayment ages sooner.'],['Flat / low slope',8,'Flat roofs wear faster and pond water.'],['Not sure',0,'We\'ll confirm the material on site.']]},
    {id:'shingles',q:'Any missing, curling or cracked shingles?',opts:[['None I can see',0,'Surface looks intact from the ground.'],['A few',12,'Missing or curling shingles let water in.'],['Lots of them',24,'Widespread wear — the roof is losing its seal.'],['Not sure',4,'Hard to see from the ground — worth a look.']]},
    {id:'leak',q:'Any ceiling stains or leaks inside?',opts:[['No',0,'No sign of water getting in.'],['Old stain, dry now',10,'A past leak — make sure it was fixed properly.'],['Yes, recently',26,'Water is getting in now — act before it spreads.']]},
    {id:'granules',q:'Granules in the gutters or moss on the roof?',opts:[['No',0,'Shingle surface looks healthy.'],['Some granules',9,'Shingles are wearing through their top coat.'],['Moss or algae',6,'Moss holds moisture against the roof.'],['Both',14,'Wear and moisture together speed up aging.']]},
    {id:'storm',q:'Hail or high wind in the last year?',opts:[['No',0,'No recent storm stress.'],['Yes',9,'Storm damage often isn\'t visible from the ground — and may be covered by insurance.'],['Not sure',3,'Worth checking your area\'s storm history.']]}
  ]},
  damage:{title:'Roof Damage Check',
    where:[['Shingles / roof surface','Missing or damaged shingles'],['Flashing, vents or chimney','Flashing failure'],['Ceiling or attic (inside)','Active roof leak'],['Gutters or edges','Gutter / fascia damage']],
    worse:'Is water getting in right now?',worseOpts:['Yes, it\'s leaking','Only when it rains hard','No leak','Not sure']}},
hvac:{name:'HVAC',noun:'HVAC system',
  cost:{maint:[120,320],repair:[350,1800],major:[6500,14500]},
  health:{title:'HVAC Health Check',qs:[
    {id:'age',q:'How old is your AC or furnace?',opts:[['Under 6 years',0,'Young system — mostly maintenance.'],['6–12 years',10,'Mid-life — parts start to wear.'],['12–17 years',26,'Near the end of a typical 15-year life.'],['Over 17 years',40,'Past typical lifespan — failures get likely and costly.'],['Not sure',12,'We\'ll read the age off the unit\'s data plate.']]},
    {id:'service',q:'When was it last serviced?',opts:[['Within a year',0,'Regular service keeps efficiency up.'],['1–3 years ago',8,'Overdue for a tune-up.'],['Over 3 years / never',16,'Dirty coils and low charge cost you every month.'],['Not sure',6,'A tune-up is a cheap way to find out.']]},
    {id:'temps',q:'Uneven temperatures between rooms?',opts:[['No, it\'s even',0,'Air is reaching the whole house.'],['A little',6,'Often ductwork or airflow — usually a cheap fix.'],['Some rooms are way off',14,'Duct leaks or an undersized system.']]},
    {id:'noise',q:'Any strange noises or smells?',opts:[['No',0,'Sounds normal.'],['Rattling or buzzing',10,'Loose parts or a failing capacitor/motor.'],['Grinding, squealing or burning smell',22,'A motor or bearing is failing — shut it off and call.'],['Not sure',3,'We\'ll listen during the visit.']]},
    {id:'bills',q:'Energy bills rising?',opts:[['No',0,'Efficiency looks steady.'],['A bit',6,'Efficiency is slipping.'],['Noticeably',14,'The system is working much harder than it should.']]},
    {id:'cycle',q:'Does it run constantly or short-cycle?',opts:[['Runs normally',0,'Normal cycling.'],['Runs nonstop',12,'Low refrigerant, dirty coils or undersized.'],['Turns on and off a lot',12,'Short-cycling wears out the compressor.']]}
  ]},
  damage:{title:'HVAC Damage Check',
    where:[['Outdoor unit / condenser','Condenser damage'],['Indoor unit / furnace','Furnace or air handler fault'],['Ducts or vents','Duct damage / leak'],['Water around the unit','Condensate leak']],
    worse:'Is the system still working?',worseOpts:['Not working at all','Working poorly','Working fine','Not sure']}},
plumbing:{name:'Plumbing',noun:'plumbing',
  cost:{maint:[150,400],repair:[350,2000],major:[3500,15000]},
  health:{title:'Plumbing Health Check',qs:[
    {id:'pipes',q:'How old is the home (or its pipes)?',opts:[['Built after 2000',0,'Modern PEX/copper — long life left.'],['1970–2000',10,'Copper or early plastic — check fittings.'],['Before 1970',24,'May have galvanized or cast iron nearing end of life.'],['Polybutylene (grey pipe)',30,'Polybutylene is known to fail suddenly.'],['Not sure',8,'We\'ll identify pipe material on site.']]},
    {id:'wh',q:'How old is the water heater?',opts:[['Under 6 years',0,'Plenty of life left.'],['6–10 years',10,'Mid-to-late life — flush it yearly.'],['Over 10 years',22,'Tank heaters usually fail at 8–12 years.'],['Tankless',0,'Tankless units last 20 years with descaling.'],['Not sure',8,'The age is on its label.']]},
    {id:'pressure',q:'How is the water pressure?',opts:[['Strong',0,'Pressure is healthy.'],['Weak in places',10,'Buildup or a partial blockage.'],['Banging or very high',10,'High pressure strains every fixture.']]},
    {id:'leaks',q:'Any leaks, drips or water stains?',opts:[['None',0,'No sign of leaks.'],['A dripping faucet',4,'Small, but it adds up on the bill.'],['Stains or damp spots',22,'Hidden leaks cause mold and rot.']]},
    {id:'drains',q:'Slow drains or backups?',opts:[['No',0,'Drains are flowing.'],['One slow drain',6,'Usually a local clog.'],['Several, or sewer smell',20,'Points to the main line — camera it before it backs up.']]},
    {id:'water',q:'Water color or taste issues?',opts:[['No',0,'Water looks normal.'],['Rusty or discolored',14,'Corroding pipes or water heater.'],['Not sure',2,'Easy to test during a visit.']]}
  ]},
  damage:{title:'Plumbing Damage Check',
    where:[['Under a sink or fixture','Fixture or supply-line leak'],['Ceiling or wall','Hidden pipe leak'],['Water heater','Water heater leak'],['Floor / drain / sewer','Drain or sewer backup']],
    worse:'Is water actively leaking?',worseOpts:['Yes, right now','On and off','No, it stopped','Not sure']}},
electrical:{name:'Electrical',noun:'electrical system',
  cost:{maint:[150,400],repair:[300,1600],major:[2200,6500]},
  health:{title:'Electrical Safety Check',qs:[
    {id:'panel',q:'What brand is your electrical panel?',hint:'It\'s printed inside the panel door.',opts:[['A common brand (Square D, Siemens, Eaton…)',0,'Mainstream panel brands are fine.'],['Federal Pacific or Zinsco',34,'Federal Pacific and Zinsco panels have known breaker failures — a fire risk. Replacement is recommended.'],['Fuse box',26,'Fuses are outdated and often overloaded.'],['Not sure',8,'Snap a photo of the label — we\'ll check it.']]},
    {id:'age',q:'How old is the home\'s wiring?',opts:[['Under 20 years',0,'Modern wiring.'],['20–40 years',8,'Usually fine; may lack today\'s safety devices.'],['Over 40 years',18,'May have aluminum, cloth or knob-and-tube wiring.'],['Not sure',6,'An inspection will tell.']]},
    {id:'flicker',q:'Do lights flicker or dim?',opts:[['No',0,'Stable power.'],['Sometimes, when appliances start',8,'Circuits may be overloaded.'],['Often',18,'Loose connections — a common fire cause.']]},
    {id:'trip',q:'Breakers tripping?',opts:[['Rarely or never',0,'Circuits are coping.'],['Now and then',8,'A circuit is near its limit.'],['Often',18,'Overloaded circuits or a fault — get it checked.']]},
    {id:'outlets',q:'Any 2-prong outlets, or warm/buzzing outlets?',opts:[['No',0,'Outlets look up to date.'],['2-prong outlets',10,'Ungrounded outlets — no protection for electronics or people.'],['Warm, buzzing or scorched',30,'Stop using it — this is a fire warning sign.']]},
    {id:'gfci',q:'GFCI outlets in kitchen and bathrooms?',opts:[['Yes',0,'Shock protection where water is.'],['No / not sure',8,'Code requires GFCI near water — cheap and important.']]}
  ]},
  damage:{title:'Electrical Damage Check',
    where:[['Outlet or switch','Damaged outlet / switch'],['Electrical panel','Panel or breaker damage'],['Wiring or fixture','Damaged wiring / fixture'],['Outside (meter, service line)','Service entrance damage']],
    worse:'Any burning smell, sparks or heat?',worseOpts:['Yes','It happened once','No','Not sure']}},
pools:{name:'Pools',noun:'pool',
  cost:{maint:[150,450],repair:[500,2800],major:[6000,16000]},
  health:{title:'Pool Health Check',qs:[
    {id:'equip',q:'How old is the pump and filter?',opts:[['Under 5 years',0,'Equipment is young.'],['5–10 years',10,'Seals and motors start to wear.'],['Over 10 years',22,'Near end of life — and old pumps waste power.'],['Not sure',8,'We\'ll check the labels.']]},
    {id:'surface',q:'When was it last resurfaced?',opts:[['Under 8 years',0,'Surface has life left.'],['8–15 years',10,'Plaster is aging.'],['Over 15 / never',20,'Rough or etched plaster is due.'],['Not sure',6,'We\'ll read the surface on site.']]},
    {id:'cracks',q:'Any cracks or loose tile?',opts:[['No',0,'Shell and tile look sound.'],['Hairline cracks or a few tiles',10,'Surface cracks — monitor and patch.'],['Large cracks or many tiles',24,'Possible structural movement.']]},
    {id:'loss',q:'Losing more water than usual?',opts:[['No',0,'No sign of leaks.'],['A little',10,'Could be evaporation — a bucket test tells.'],['Over 1/4 inch a day',20,'Likely a leak in the shell or plumbing.']]},
    {id:'pump',q:'Pump noise?',opts:[['Quiet',0,'Pump sounds healthy.'],['Humming or rattling',10,'Bearings or a clogged impeller.'],['Screeching or won\'t prime',18,'The motor is failing.']]},
    {id:'water',q:'Trouble keeping water clear?',opts:[['No',0,'Chemistry and filtration are working.'],['Sometimes',6,'Filter may need cleaning.'],['Constant algae or cloudiness',14,'Filtration isn\'t keeping up.']]}
  ]},
  damage:{title:'Pool Damage Check',
    where:[['Pool surface / plaster','Surface cracking or delamination'],['Tile or coping','Tile / coping damage'],['Pump, filter or heater','Equipment failure'],['Deck around the pool','Deck cracking']],
    worse:'Is the pool losing water?',worseOpts:['Yes, a lot','A little','No','Not sure']}},
landscaping:{name:'Landscaping',noun:'yard',
  cost:{maint:[150,500],repair:[800,3500],major:[6000,20000]},
  health:{title:'Yard Health Check',qs:[
    {id:'lawn',q:'How does the lawn look?',opts:[['Thick and green',0,'Healthy turf.'],['Thin or patchy',12,'Soil, shade or watering issues.'],['Mostly dead or weeds',24,'Needs renovation or new sod.']]},
    {id:'irr',q:'How is the irrigation?',opts:[['Works well',0,'Coverage looks right.'],['Dry spots or broken heads',12,'Heads or zones need repair.'],['No system / doesn\'t work',14,'Watering by hand rarely keeps up.']]},
    {id:'drain',q:'Water pooling after rain?',opts:[['No',0,'Drainage is fine.'],['Some puddles',10,'Grading or soil compaction.'],['Water near the foundation',24,'Water against the house can damage the foundation.']]},
    {id:'trees',q:'Trees and shrubs?',opts:[['Healthy and trimmed',0,'Plantings are in good shape.'],['Overgrown',8,'Overdue for pruning.'],['Dead branches or limbs over the house',18,'A risk to the roof in a storm.']]},
    {id:'beds',q:'Beds, mulch and edging?',opts:[['Tidy',0,'Beds are maintained.'],['Weedy or bare',8,'Fresh mulch and edging go a long way.']]},
    {id:'hard',q:'Any walls, steps or pavers shifting?',opts:[['No',0,'Hardscape is stable.'],['A little',10,'Base settling — fix it before it spreads.'],['Yes, leaning or heaving',20,'Retaining wall or base failure.']]}
  ]},
  damage:{title:'Yard Damage Check',
    where:[['Lawn','Turf damage'],['Trees or shrubs','Tree / storm damage'],['Irrigation','Irrigation break'],['Walls, pavers or drainage','Erosion / hardscape failure']],
    worse:'Is it getting worse or causing water problems?',worseOpts:['Yes, quickly','Slowly','No','Not sure']}},
painting:{name:'Painting',noun:'paint',
  cost:{maint:[300,900],repair:[1200,4000],major:[4000,12000]},
  health:{title:'Paint Health Check',qs:[
    {id:'age',q:'How long since the last paint job?',opts:[['Under 4 years',0,'Fresh paint.'],['4–8 years',10,'Mid-life for exterior paint.'],['Over 8 years',24,'Exterior paint usually needs redoing every 7–10 years.'],['Not sure',8,'We\'ll judge it on site.']]},
    {id:'peel',q:'Any peeling, cracking or bubbling?',opts:[['No',0,'Film is intact.'],['In a few spots',12,'Moisture is getting behind the paint.'],['Lots of it',24,'The coating has failed — bare wood is exposed.']]},
    {id:'chalk',q:'Does a white chalky residue rub off?',opts:[['No',0,'Binder is intact.'],['A little',6,'Paint is starting to break down.'],['Yes, heavily',12,'Chalking means the paint is spent.']]},
    {id:'fade',q:'Fading or uneven color?',opts:[['No',0,'Color is holding.'],['Some fading',6,'UV wear, mostly cosmetic.'],['Very faded',10,'Protection is thinning.']]},
    {id:'wood',q:'Any soft or rotted wood (trim, siding)?',opts:[['No',0,'Substrate is sound.'],['A spot or two',14,'Repair before painting or it spreads.'],['Several areas',24,'Carpentry repairs needed first.']]},
    {id:'scope',q:'Interior, exterior or both?',opts:[['Exterior',0,'We\'ll focus outside.'],['Interior',0,'We\'ll focus inside.'],['Both',0,'We\'ll look at both.']]}
  ]},
  damage:{title:'Paint Damage Check',
    where:[['Exterior siding','Peeling / failed exterior paint'],['Trim, doors or windows','Trim paint failure / wood rot'],['Interior walls','Interior wall damage'],['Ceilings','Ceiling stain / water damage']],
    worse:'Is there moisture or a leak behind it?',worseOpts:['Yes','Maybe','No','Not sure']}},
concrete:{name:'Concrete & Paving',noun:'concrete',
  cost:{maint:[200,700],repair:[900,4000],major:[5000,15000]},
  health:{title:'Concrete Health Check',qs:[
    {id:'age',q:'How old is the concrete?',opts:[['Under 10 years',0,'Young slab.'],['10–25 years',10,'Mid-life — sealing extends it.'],['Over 25 years',20,'Older concrete is due for repair or replacement.'],['Not sure',6,'We\'ll judge it on site.']]},
    {id:'cracks',q:'What do the cracks look like?',opts:[['None or hairline',0,'Normal shrinkage cracks.'],['Wider than a pencil',14,'Movement underneath — seal to keep water out.'],['Wide and uneven (one side higher)',26,'Settlement — a trip hazard and a sign of base failure.']]},
    {id:'settle',q:'Any sinking or settling?',opts:[['No',0,'Slab is level.'],['A little',12,'Leveling (mudjacking/foam) can save it.'],['Yes, clearly',24,'Significant settlement — repair or replace.']]},
    {id:'spall',q:'Flaking or pitted surface (spalling)?',opts:[['No',0,'Surface is intact.'],['In spots',10,'Freeze-thaw or salt damage.'],['Widespread',20,'The surface is breaking down.']]},
    {id:'drain',q:'Does water pool or run toward the house?',opts:[['No',0,'Drainage is fine.'],['Some pooling',8,'Low spots hold water.'],['Toward the house',18,'Water against the foundation — fix the slope.']]},
    {id:'seal',q:'Ever been sealed?',opts:[['Within 3 years',0,'Protected.'],['Longer ago / never',6,'Sealing every few years stops water damage.'],['Not sure',3,'Easy to check with a water drop test.']]}
  ]},
  damage:{title:'Concrete Damage Check',
    where:[['Driveway','Driveway cracking'],['Sidewalk or walkway','Settled / heaved walkway'],['Patio or pool deck','Patio cracking / spalling'],['Steps or foundation','Step / foundation crack']],
    worse:'Is it a trip hazard or getting worse?',worseOpts:['Yes, a trip hazard','Getting wider','Stable','Not sure']}},
flooring:{name:'Flooring',noun:'floors',
  cost:{maint:[150,500],repair:[400,2200],major:[4000,14000]},
  health:{title:'Floor Health Check',qs:[
    {id:'age',q:'How old are the floors?',opts:[['Under 8 years',0,'Floors are young.'],['8–20 years',10,'Mid-life — refinishing or wear layers matter.'],['Over 20 years',20,'Most carpet, laminate and vinyl are done by now.'],['Not sure',6,'We\'ll identify them on site.']]},
    {id:'type',q:'What type of floor?',opts:[['Hardwood',0,'Hardwood can be refinished several times.'],['Laminate or vinyl',4,'Can\'t be refinished — damaged planks are replaced.'],['Carpet',6,'Carpet lasts 8–12 years.'],['Tile',0,'Tile lasts decades if the grout is kept.']]},
    {id:'squeak',q:'Squeaks or soft spots?',opts:[['No',0,'Subfloor is solid.'],['Some squeaks',6,'Loose subfloor fasteners — fixable.'],['Soft or bouncy spots',20,'Subfloor damage, often from water.']]},
    {id:'gaps',q:'Gaps, cupping or lifting?',opts:[['No',0,'Boards are stable.'],['Small gaps',6,'Seasonal humidity movement.'],['Cupping or lifting',18,'Moisture is getting into the floor.']]},
    {id:'water',q:'Any water damage or stains?',opts:[['No',0,'No water damage.'],['Old stains',10,'Past water — check the subfloor.'],['Recent or ongoing',24,'Fix the source fast to stop mold and rot.']]},
    {id:'wear',q:'Scratches and wear?',opts:[['Minor',0,'Normal wear.'],['Worn traffic paths',8,'The finish is worn through.'],['Heavy damage',14,'Replacement or a full refinish.']]}
  ]},
  damage:{title:'Floor Damage Check',
    where:[['Kitchen or bathroom','Water-damaged flooring'],['Living areas / bedrooms','Surface wear / scratches'],['Near a door or window','Moisture / weather damage'],['Stairs','Stair tread damage']],
    worse:'Is the floor still getting wet?',worseOpts:['Yes','Sometimes','No','Not sure']}},
countertops:{name:'Countertops',noun:'countertops',
  cost:{maint:[150,400],repair:[300,1200],major:[3000,8500]},
  health:{title:'Countertop Health Check',qs:[
    {id:'mat',q:'What are your countertops made of?',opts:[['Granite or quartz',0,'Durable stone.'],['Marble',4,'Beautiful but stains and etches.'],['Laminate',8,'Laminate wears and swells at seams.'],['Tile or other',8,'Grout lines stain and crack.']]},
    {id:'age',q:'How old are they?',opts:[['Under 10 years',0,'Plenty of life.'],['10–20 years',10,'Showing their age.'],['Over 20 years',18,'Likely due for an update.'],['Not sure',6,'We\'ll take a look.']]},
    {id:'chips',q:'Chips or cracks?',opts:[['None',0,'Intact.'],['Small chips',8,'Usually repairable.'],['Cracks',20,'Cracks can spread — repair or replace.']]},
    {id:'stain',q:'Stains or dull spots?',opts:[['No',0,'Surface is sealed.'],['Some',8,'Sealing or polishing helps.'],['Many',14,'The surface has absorbed a lot.']]},
    {id:'seams',q:'Seams or edges separating or swelling?',opts:[['No',0,'Seams are tight.'],['A little',10,'Re-epoxy the seam.'],['Swollen or lifting',20,'Water is getting under — common with laminate.']]},
    {id:'sealed',q:'When were they last sealed? (stone)',opts:[['Within a year',0,'Protected.'],['Longer / never',6,'Stone should be sealed every 1–2 years.'],['Not stone / not sure',0,'We\'ll advise on care.']]}
  ]},
  damage:{title:'Countertop Damage Check',
    where:[['Edge or corner','Edge chip'],['Middle of the counter','Crack'],['Around the sink','Water damage / seam failure'],['Backsplash','Backsplash damage']],
    worse:'Is it getting worse or loose?',worseOpts:['Yes','A little','No','Not sure']}},
trim:{name:'Trim & Carpentry',noun:'trim',
  cost:{maint:[150,500],repair:[400,1800],major:[2500,8000]},
  health:{title:'Trim Health Check',qs:[
    {id:'age',q:'How old is the trim and molding?',opts:[['Under 10 years',0,'Young.'],['10–25 years',8,'Joints open over time.'],['Over 25 years',14,'Original trim often needs repair.'],['Not sure',4,'We\'ll look.']]},
    {id:'gaps',q:'Gaps or open joints?',opts:[['No',0,'Joints are tight.'],['Small gaps',6,'Caulk and touch-up.'],['Large gaps',14,'Movement or poor install.']]},
    {id:'rot',q:'Soft or rotted wood (doors, windows, exterior)?',opts:[['No',0,'Sound wood.'],['A spot or two',16,'Rot spreads — replace the bad sections.'],['Several areas',28,'Moisture is getting in at several points.']]},
    {id:'paint',q:'Paint failing on trim?',opts:[['No',0,'Protected.'],['Some',8,'Bare wood soaks up water.'],['A lot',14,'Wood is exposed.']]},
    {id:'doors',q:'Doors sticking or not latching?',opts:[['No',0,'Frames are square.'],['One or two',6,'Usually an adjustment.'],['Several',14,'Settlement or swelling.']]},
    {id:'goal',q:'What are you hoping for?',opts:[['Fix what\'s broken',0,'We\'ll focus on repairs.'],['Upgrade the look',0,'We\'ll include an upgrade option.'],['Both',0,'Repair plus upgrade.']]}
  ]},
  damage:{title:'Trim Damage Check',
    where:[['Exterior trim / fascia','Rotted exterior trim'],['Window or door casing','Damaged casing'],['Baseboards','Damaged baseboard'],['Stairs or railing','Stair / railing damage']],
    worse:'Is it soft, wet or getting worse?',worseOpts:['Yes','A little','No','Not sure']}},
general:{name:'General Remodel',noun:'home',
  cost:{maint:[300,1000],repair:[2000,10000],major:[15000,60000]},
  health:{title:'Home Health Check',qs:[
    {id:'age',q:'How old is the home?',opts:[['Under 15 years',0,'Systems are young.'],['15–35 years',10,'Systems are reaching mid-life.'],['35–60 years',18,'Original systems are often due.'],['Over 60 years',24,'Expect older wiring, plumbing and structure.']]},
    {id:'updated',q:'When was it last updated?',opts:[['Within 10 years',0,'Recently updated.'],['10–25 years',8,'Dated finishes.'],['Never / original',16,'Due for a refresh.']]},
    {id:'systems',q:'Are the big systems (roof, HVAC, water heater) original?',opts:[['No, replaced',0,'Major systems updated.'],['Some are',10,'Plan for replacements.'],['All original',20,'Several big costs may be coming.']]},
    {id:'water',q:'Any signs of water — stains, musty smells, mold?',opts:[['No',0,'No water signs.'],['A little',12,'Find the source before remodeling.'],['Yes, clearly',24,'Water damage needs fixing first.']]},
    {id:'struct',q:'Cracks in walls, sloping floors or sticking doors?',opts:[['No',0,'Structure looks sound.'],['Minor',8,'Normal settling.'],['Significant',22,'Possible structural movement — inspect before work.']]},
    {id:'goal',q:'What would you like to do?',opts:[['Kitchen',0,'Kitchens are the most popular remodel.'],['Bathroom',0,'Bathrooms are a quick win.'],['Whole home or addition',0,'We\'ll plan it in phases.'],['Just fix problems',0,'We\'ll start with repairs.']]}
  ]},
  damage:{title:'Home Damage Check',
    where:[['Walls or ceiling','Drywall / water damage'],['Kitchen or bathroom','Water damage at fixtures'],['Floors','Floor / subfloor damage'],['Exterior','Exterior / siding damage']],
    worse:'Is it getting worse or still wet?',worseOpts:['Yes','A little','No','Not sure']}}
};
