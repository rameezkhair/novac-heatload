/* Library digests: NOVAC's own summaries of the authority documents behind the calculator. Each item is written
   in NOVAC's words, with the clause it comes from and the values it sets; the full text stays with the publisher,
   linked from each digest. 'shall' items are mandatory in the source, 'should' items are recommendations. */

export interface DigestItem { kind: 'shall' | 'should' | 'info'; text: string }
export interface DigestSection { title: string; ref: string; items: DigestItem[]; table?: { head: string[]; rows: string[][] }; novac?: string }
export interface Digest { id: string; title: string; by: string; edition: string; href: string; summary: string; sections: DigestSection[] }

const shall = (text: string): DigestItem => ({ kind: 'shall', text });
const should = (text: string): DigestItem => ({ kind: 'should', text });
const info = (text: string): DigestItem => ({ kind: 'info', text });

export const CLM: Digest = {
  id: 'clm',
  title: 'Abu Dhabi Cooling Load Manual',
  by: 'Department of Energy, Abu Dhabi, with DMT',
  edition: 'DoE_PR_P04_001, May 2026',
  href: 'https://www.doe.gov.ae/-/media/Project/DOE/Department-Of-Energy/Media-Center-Publications/2026/July/CoolingLoadManual-eng.pdf',
  summary: 'Best practice for right-sizing air conditioning on new developments in the Emirate of Abu Dhabi. It does not prescribe a calculation method; it sets design conditions, warns against common causes of oversizing and asks for diversified plant loads.',
  sections: [
    {
      title: 'Scope and verification', ref: '§1, §1.1',
      items: [
        info('Applies to new developments in the Emirate of Abu Dhabi, from concept design to 100% detailed design.'),
        shall('Size HVAC equipment from a model built in simulation software that meets Appendix 1.'),
        shall('Where the design load differs from the Cooling Load Verification Tool (CLVT) benchmark by more than ±10%, justify the difference with supporting documents.'),
        info('The CLVT covers offices, mosques, hotels, schools, retail, restaurants, multi-residential buildings and villas. It is not intended for projects on district cooling.'),
      ],
    },
    {
      title: 'Outdoor design conditions', ref: '§2.1–2.2, Tables 1–2',
      table: {
        head: ['Parameter', 'Abu Dhabi City (coastal)', 'Al Ain City (inland)'],
        rows: [
          ['Envelope heat gain: dry bulb / wet bulb', '46.1 °C / 29.4 °C', '48.8 °C / 28.3 °C'],
          ['Ventilation load: dry bulb / wet bulb', '35.3 °C / 30.6 °C', '35.8 °C / 28.8 °C'],
          ['Elevation', '27 m', '265 m'],
          ['Climate zone', '0B (ASHRAE 169) / 1 (ADIECC)', '0B / 1'],
        ],
      },
      items: [
        shall('Use the Abu Dhabi City or Al Ain City values for projects in those cities.'),
        shall('Outside the two cities, adjust the design dry and wet bulb to the local climate from ASHRAE Fundamentals Ch. 14 or official UAE meteorological data, use the adjusted values throughout, and keep a record of them.'),
        shall('Where untreated fresh air is supplied to a space, calculate the load at both the peak dry bulb and the peak wet bulb condition and size the space system on the higher.'),
        should('Do not change the design conditions on personal judgement or at the client\'s request.'),
      ],
      novac: 'Picking Abu Dhabi or Al Ain fills in these outdoor and fresh-air conditions and the site elevation.',
    },
    {
      title: 'Indoor conditions and zoning', ref: '§3',
      items: [
        info('Indoor conditions target comfort for 80% of occupants, following ASHRAE 55-2023.'),
        should('Give open spaces over 40 m² multi-zone control, and control perimeter zones deeper than 5 m separately.'),
        should('Use modulating controls rather than on-off control wherever practical.'),
        info('Air speed in the occupied zone is best kept at 0.1–0.25 m/s; below 0.05 m/s feels stagnant, above 0.25 m/s draughty.'),
      ],
    },
    {
      title: 'Building geometry', ref: '§4',
      items: [
        should('Model the true orientation; a wrong orientation over- or under-sizes the plant.'),
        info('A block load suits early estimates only. For final sizing, model each HVAC zone, or combine zones only when they share the space use, face within 45° of each other, are on the same system and run similar schedules.'),
        info('Perimeter zones are those within 4–6 m of an exterior wall.'),
        should('Include neighbouring buildings that shade the site, but not ones due to be demolished or redeveloped.'),
      ],
      novac: 'NOVAC calculates each room on its own and reports the coincident block load alongside.',
    },
    {
      title: 'Building envelope', ref: '§5.1',
      items: [
        should('Account for thermal mass, insulation, surface colour and thermal bridging in walls and roofs.'),
        should('Use the whole-window U-value including the frame, not the centre-of-glass value from data sheets, together with the SHGC and the actual frame-to-glass ratio.'),
        should('Include heat gain through floors over unconditioned spaces or the ground, and through internal walls next to unconditioned rooms.'),
        should('At concept stage, compare at least two options each for orientation, shading, window-to-wall ratio, glazing performance and opaque insulation, and record which measures were adopted and why.'),
      ],
      novac: 'NOVAC models walls and roofs layer by layer with their thermal mass, and includes floors and partitions next to unconditioned spaces.',
    },
    {
      title: 'Ventilation and infiltration', ref: '§5.2–5.3',
      items: [
        info('Keep the building at positive pressure, for example by supplying about 10% more fresh air than is exhausted.'),
        info('Demand-controlled ventilation is required in large or high-density spaces; check it does not leave the building at negative pressure.'),
        should('Use efficient heat recovery on fresh-air and make-up air units, selected to ADIECC, ADIMC and ASHRAE guidance.'),
        shall('Without an airtightness test, take the envelope leakage as 2.03 L/s·m² at 75 Pa.'),
        shall('Convert a measured leakage to the wall-area basis with I(AGW) = 0.112 × I(75 Pa) × S / A(AGW), where S is the whole envelope area and A(AGW) the above-grade wall area.'),
        should('Work out infiltration zone by zone from the actual doors and windows rather than one air-change rate for the whole building.'),
      ],
      novac: 'NOVAC takes infiltration as air changes per hour for each room, and fresh air from ASHRAE 62.1 with optional energy recovery.',
    },
    {
      title: 'Internal heat gains', ref: '§6',
      items: [
        should('Base lighting on the actual lighting design, not rule-of-thumb or code-maximum W/m². The manual\'s example: assuming 10 W/m² instead of an actual 6 W/m² over 10,000 m² adds 40 kW.'),
        should('Base occupancy on the furniture layout, confirmed with the client; use ASHRAE 62.1 or ADIMC Table 403.3 defaults only when no layout exists.'),
        info('People heat gains come from ASHRAE Fundamentals 2021 for the activity level.'),
        should('Use actual equipment heat gains. Office equipment is typically about 15 W/m² (CIBSE TM37). Count only the kitchen heat that the hoods do not remove, and leave out short-use appliances such as hairdryers.'),
        should('Add the heat from fan and pump motors to the system load.'),
      ],
      novac: 'Lighting, equipment and occupancy are entered for each room, with ASHRAE Fundamentals heat gains by activity.',
    },
    {
      title: 'Safety margins and diversity', ref: '§7.1–7.2',
      items: [
        should('Do not stack safety factors on space loads, equipment and plant. Any margin must be justified.'),
        info('The CIBSE Design Guide for Abu Dhabi allows up to 10% on sensible and 5% on latent space loads.'),
        shall('Size the central plant on the diversified demand: the coincident peak of all zones, less the safety factors, with diversity on lighting, people, equipment, infiltration and ventilation (Table 4).'),
        info('In the manual\'s four-zone example, the coincident peak is 16.9 kW against 25.9 kW for the sum of zone peaks. A two-bedroom flat sized for 15 people across its rooms has 4 occupants: a diversity of 27%.'),
        should('Where infiltration is 15% or more of the external gains, study it in more detail, for example with CFD.'),
        info('For the plant, take the ventilation load at the plant\'s peak condition, not the dehumidification peak.'),
      ],
      novac: 'NOVAC applies sensible and latent margins, reports the coincident block load next to the sum of room peaks, and takes a plant diversity factor.',
    },
    {
      title: 'Distribution losses and design conditions', ref: '§7.3–7.4',
      items: [
        shall('Insulate pipes and ducts, as ADIECC requires.'),
        should('Specify ductwork for low leakage (SMACNA or DW 144) and leak-test main ducts in plant rooms and risers first.'),
        info('Designing to conditions hotter than the code values oversizes the plant: in the manual\'s example, 52 °C instead of 45.1 °C added about 6%.'),
      ],
    },
    {
      title: 'Cooling plant and review', ref: '§8–9',
      items: [
        should('Do not add standby chillers by default. Support the choice with a risk assessment covering faults through the year, rental options, space and electrical infrastructure.'),
        should('Select the plant on a life-cycle cost basis, considering thermal storage, heat recovery and district cooling compatibility.'),
        should('Have a senior engineer review every design and calculation stage.'),
      ],
    },
    {
      title: 'Simulation software', ref: 'Appendix 1',
      items: [
        shall('Software must follow ASHRAE 90.1 Appendix G, be validated to ASHRAE 140, run 8,760 hourly steps on local weather, handle at least 10 zones, thermal mass and part-load curves, and give diversified plant loads.'),
        info('The manual names IES VE, HAP, EnergyPlus, TRACE and TAS as generally compliant, without endorsing any. The CLVT itself uses the ASHRAE heat balance method.'),
      ],
      novac: 'NOVAC uses the ASHRAE heat balance method. It is not listed in the manual; confirm acceptance with DoE before using it for a CLM submission.',
    },
  ],
};

export const DBC_H4: Digest = {
  id: 'dbc-h4',
  title: 'Dubai Building Code, Part H.4: HVAC systems and occupant comfort',
  by: 'Dubai Municipality',
  edition: '2021 edition',
  href: 'https://www.dm.gov.ae/municipality-business/planning-and-construction/dubai-building-code-2/',
  summary: 'The minimum requirements for HVAC design in Dubai: design conditions, load calculation rules, comfort, energy efficiency, ventilation and air quality, ductwork and pipework, controls and metering.',
  sections: [
    {
      title: 'General', ref: 'H.4.1, H.4.5',
      items: [
        shall('Design HVAC systems for low energy use, occupant comfort, long life, easy maintenance and simple controls.'),
        shall('Where this section is silent, follow the current ASHRAE handbooks, guides and standards. Healthcare buildings follow the Dubai Health Authority regulations and guidelines.'),
        shall('Base background noise criteria on ASHRAE HVAC Applications Ch. 49, Table 1, and use an acoustic consultant for acoustically critical spaces.'),
      ],
    },
    {
      title: 'Design conditions', ref: 'H.4.6.2–H.4.6.4, Tables H.1–H.2',
      table: {
        head: ['Condition', 'Value'],
        rows: [
          ['Outdoor dry bulb / wet bulb', '46 °C / 29 °C'],
          ['Outdoor daily range', '13.8 K'],
          ['Latitude; climate zone', '25° N; 0B (ASHRAE 169:2013)'],
          ['Indoor dry bulb', '24 °C ±1.5 °C'],
          ['Indoor relative humidity', '50% ±5%'],
          ['Outdoor air system design (maximum)', '34 °C DB / 32 °C WB'],
          ['Safety factor, sensible / latent', '≤10% / ≤5%'],
        ],
      },
      items: [
        shall('Use these outdoor and indoor conditions for buildings in Dubai. For other occupancies, take indoor conditions from ASHRAE HVAC Applications.'),
        shall('Where diversity factors are not known, use those in ASHRAE Fundamentals Ch. 18.'),
        shall('Give every fully air-conditioned building an outdoor air system that supplies treated outdoor air for at least 95% of the year.'),
      ],
      novac: 'Selecting Dubai fills in these outdoor, fresh-air and indoor conditions, and the margins are entered as sensible and latent safety factors.',
    },
    {
      title: 'Load calculation', ref: 'H.4.6.1, H.4.6.5–H.4.6.7',
      items: [
        shall('Meet the Part E envelope requirements and, where needed, the ASHRAE 90.1 energy targets.'),
        shall('Calculate the load of every air-conditioned space, including the time of its peak, with software registered with the Authority.'),
        shall('Account for orientation, envelope construction, plans, elevations and sections, external shading (E.5.3) and any special use requirements.'),
        shall('Take occupancy from the client or architect, using B.5.1; where a space has no density, use the ASHRAE 62.1, 62.2 or 170 defaults.'),
        shall('Use project-specific lighting and equipment loads; where they are not known, use ASHRAE 90.1 values.'),
      ],
      novac: 'NOVAC calculates each room with its peak hour and month, and offers DBC Table B.2 and ASHRAE defaults for occupancy, lighting and equipment. Check whether NOVAC is registered with Dubai Municipality before using it for a submission.',
    },
    {
      title: 'Thermal comfort', ref: 'H.4.7, Table H.3',
      table: { head: ['Variable', 'Range, for 95% of the year'], rows: [['Dry bulb', '22.5–25.5 °C'], ['Relative humidity', '30–60%']] },
      items: [shall('Keep the average air speed in normally occupied spaces between 0.2 and 0.3 m/s.')],
    },
    {
      title: 'Energy efficiency', ref: 'H.4.8',
      items: [
        shall('Split, packaged, multi-split and water-source heat pump units must meet ESMA UAE.S 5010-5 (Tables 1, 2 and 4); chillers must meet ASHRAE 90.1-2019 Tables 6.8.1–6.8.3, including low-temperature chillers.'),
        shall('Where treated outdoor air exceeds 1,000 L/s, recover energy from at least 50% of the exhaust air at 70% or better sensible effectiveness.'),
        shall('Use CO₂-based demand-controlled ventilation in spaces over 100 m² with 25 or more people per 100 m²: set point below 800 ppm, alarm above 1,000 ppm, sensors recalibrated at least every 12 months.'),
        shall('Insulate refrigerant, chilled and hot water pipes and conditioned-air ducts, in conditioned and unconditioned spaces alike, to BS 5422 or ASHRAE 90.1.'),
      ],
      novac: 'NOVAC flags rooms that need demand-controlled ventilation and takes energy recovery effectiveness for the fresh-air load.',
    },
    {
      title: 'Airtightness', ref: 'H.4.9',
      items: [
        shall('Buildings with a cooling load of 1 MW or more must leak no more than 5 m³/h per m² of envelope at 50 Pa, tested to BS EN 13829, ASTM E779 or an approved method.'),
        shall('Keep the building at positive pressure at all times, and protect main entrances with a lobby or door barrier.'),
      ],
    },
    {
      title: 'Ventilation and indoor air quality', ref: 'H.4.10–H.4.11, Table H.4',
      table: {
        head: ['Contaminant', 'Maximum (8 h time-weighted average)'],
        rows: [['Formaldehyde', '0.08 ppm'], ['Total volatile organic compounds', '300 μg/m³'], ['Suspended particulates under 10 μm', '150 μg/m³']],
      },
      items: [
        shall('Ventilate air-conditioned buildings mechanically or in mixed mode to ASHRAE 62.1, 62.2 and 170, with occupancy from B.5.1 where listed.'),
        shall('Rate general ventilation filters to ISO 16890-1, and test indoor air quality before occupancy, reporting to the Authority.'),
        shall('Separate air inlets from exhausts by at least the ASHRAE 62.1:2019 Table 5-1 distances, inlets upwind and exhausts downwind, with sand trap louvers removing 80% of coarse sand at 1 m/s face velocity.'),
        shall('Extract hazardous fumes (print rooms, laboratories) through dedicated systems that keep the space at negative pressure.'),
        info('Natural ventilation is allowed but must not be relied on for ventilation or comfort.'),
      ],
      novac: 'NOVAC calculates fresh air with the ASHRAE 62.1 ventilation rate procedure.',
    },
    {
      title: 'Mechanical ventilation and ductwork', ref: 'H.4.12.1–H.4.12.8',
      items: [
        shall('Balance supply against return and exhaust air. Air handling units must be AHRI or Eurovent certified.'),
        shall('Size ducts to the velocity and pressure drop ranges in ASHRAE Fundamentals Ch. 21 and build them to SMACNA.'),
        shall('Filter to ASHRAE 52.2 MERV ratings, including in the return air upstream of coils.'),
        shall('Pressure-test ductwork before occupancy where the external static pressure exceeds 250 Pa, or where ducts run outdoors or through unconditioned spaces.'),
        shall('Shut HVAC down automatically in a fire unless it is part of the smoke management system, with a manual stop in the command centre.'),
      ],
    },
    {
      title: 'Car parks and commercial kitchens', ref: 'H.4.12.11, H.4.12.15',
      items: [
        shall('Keep enclosed car parks below 50 ppm CO with at least 6 outdoor air changes per hour or CO-controlled variable airflow; one CO sensor per 400 m², alarm at 75 ppm in 5% of locations, 10 air changes per hour for smoke clearance.'),
        shall('Keep occupied areas next to car parks at positive pressure to them.'),
        shall('Supply 75–95% of kitchen exhaust as dedicated make-up air, keep the kitchen about −0.25 Pa to its surroundings and the building +1.25 to +5.0 Pa to outside, and keep make-up air within 6 °C of the room.'),
        shall('Fit Type I hoods with grease filters over grease- or smoke-producing appliances, and Type II hoods over dishwashers and light-duty appliances.'),
      ],
    },
    {
      title: 'Chilled and hot water systems', ref: 'H.4.13',
      table: {
        head: ['Criterion', 'Limit'],
        rows: [
          ['Pipe pressure drop', '≤250 Pa/m'],
          ['Velocity, pipes 50 mm and smaller', '≤1.2 m/s'],
          ['Velocity, pipes 65 mm and larger', '≤2.5 m/s'],
          ['Minimum velocity', '≥0.45 m/s'],
          ['Pump / motor efficiency', '≥85% / ≥95%'],
          ['Hydrostatic test', '1.5 × design pressure, at least 689 kPa for 15 min'],
        ],
      },
      items: [
        shall('Use pressure-independent two-way control valves, select pumps for 105% of design flow and variable speed from 15 to 50 Hz.'),
        shall('Use refrigerants with zero ozone depletion or a global warming potential under 100, unless the charge is under 0.23 kg.'),
      ],
    },
    {
      title: 'Controls, BMS and metering', ref: 'H.4.14',
      items: [
        shall('Divide controls into zones by exposure, load and use; each zone must control its temperature and switch off when unoccupied, and central plant runs only on demand.'),
        shall('Provide a building management system for buildings with a cooling load of 1,000 kW or 5,000 m² gross area or more.'),
        shall('Hotel rooms switch off lighting, air conditioning and power when unoccupied, with demand-controlled ventilation keeping them at positive pressure.'),
        shall('Where cooling comes from a central plant or district cooling, meter chilled water to each unit, office or tenant with approved smart meters; run-hour meters are not acceptable.'),
      ],
    },
    {
      title: 'Equipment location and heat rejection', ref: 'H.4.3–H.4.4, H.4.16.3',
      items: [
        shall('Mount heat rejection equipment over 4 kW at least 3 m above ground, and in residential apartments locate fan coil units in wet areas to limit leak damage.'),
        shall('Give equipment a level service space of at least 762 × 762 mm and meet ASHRAE 180 for maintenance.'),
        shall('Select cooling towers CTI-certified at 32 °C wet bulb with a 2–3 °C approach, discharging plumes at least 1.5 m above or 6.1 m away from air inlets.'),
      ],
    },
  ],
};

export const A621: Digest = {
  id: 'a621',
  title: 'ASHRAE 62.1-2022: Ventilation Rate Procedure',
  by: 'ASHRAE',
  edition: 'ANSI/ASHRAE Standard 62.1-2022',
  href: 'https://www.ashrae.org/technical-resources/standards-and-guidelines',
  summary: 'How the standard sets the minimum outdoor air for a ventilation system, from each zone\'s people and floor area through to the air handler intake, with the related humidity, pressurisation and exhaust rules. The rates themselves are in the ASHRAE 62.1 ventilation rates topic.',
  sections: [
    {
      title: 'Choosing a procedure', ref: '§6.1',
      items: [
        info('Outdoor air can be set by the prescriptive Ventilation Rate Procedure, the Indoor Air Quality Procedure (a contaminant mass balance), the Natural Ventilation Procedure, or a combination. The exhaust rules apply whichever is used.'),
        shall('Where the local PM10 standard is exceeded, filter outdoor air to at least MERV 8 (or ISO ePM10); where the PM2.5 standard is exceeded, to at least MERV 11 (or ISO ePM2.5).'),
      ],
    },
    {
      title: 'Zone outdoor air', ref: '§6.2.1, Eq. 6-1 and 6-2',
      table: {
        head: ['Step', 'Calculation'],
        rows: [
          ['Breathing zone outdoor air', 'Vbz = Rp × Pz + Ra × Az'],
          ['Zone outdoor air', 'Voz = Vbz / Ez'],
        ],
      },
      items: [
        info('Rp is the rate per person and Ra the rate per m² of net occupiable floor, by occupancy category; Ez is the zone air distribution effectiveness, 1.0 for ceiling supply of cool air.'),
        shall('Take the zone population as the peak expected in normal use; where it is not known, use the area times the default density for the category.'),
        shall('Use the closest listed category for an unlisted space, and add ventilation or air cleaning for unusual contaminant sources.'),
        shall('Use ASHRAE 170 rates for healthcare spaces within its scope.'),
        info('Rates are at standard air density (1.2 kg/m³); adjusting for site density is allowed but not required.'),
      ],
      novac: 'Each room\'s fresh air is calculated this way from its occupancy category, people, floor area and the Ez chosen in the envelope step.',
    },
    {
      title: 'System outdoor air intake', ref: '§6.2.2–6.2.4, Eq. 6-3 to 6-10',
      table: {
        head: ['System', 'Outdoor air intake'],
        rows: [
          ['Single zone', 'Vot = Voz'],
          ['100% outdoor air (for example a FAHU)', 'Vot = Σ Voz over all zones'],
          ['Multiple-zone recirculating', 'Vou = D × Σ(Rp × Pz) + Σ(Ra × Az); Vot = Vou / Ev'],
          ['Occupant diversity', 'D = Ps / Σ Pz'],
          ['System ventilation efficiency (simplified)', 'Ev = 0.88 × D + 0.22 when D < 0.60; Ev = 0.75 otherwise'],
          ['Zone minimum primary airflow (VAV)', 'Vpz-min = 1.5 × Voz'],
        ],
      },
      items: [
        info('Ps is the peak number of people in all the zones a system serves at once, never more than the sum of the zone populations.'),
        info('Normative Appendix A gives a more detailed alternative for the system ventilation efficiency.'),
      ],
      novac: 'The Indoor air quality tool (NOVAC Pro) runs this system calculation for a FAHU, single-zone or multiple-zone system, with the simplified or Appendix A efficiency.',
    },
    {
      title: 'Varying conditions and demand control', ref: '§6.2.5–6.2.6',
      items: [
        shall('Provide at least the breathing zone minimum whenever zones are occupied, at full and part load.'),
        info('Where peak occupancy is short, the design may use the average over T = 50 × volume / Vbz minutes (SI).'),
        info('Demand-controlled ventilation may reset outdoor air to the current population, but never below the area component Ra × Az while occupied. It must not be CO₂-based where there are other CO₂ sources.'),
        shall('CO₂ sensors for demand control must be accurate to ±75 ppm at 600 and 1,000 ppm and need calibration no more than every five years; on sensor failure the zone returns to its design outdoor air.'),
        info('Spaces marked OS in Table 6-1 may drop to zero outdoor air in occupied-standby mode, restoring it when occupancy is detected.'),
      ],
    },
    {
      title: 'Humidity and building pressure', ref: '§5.12, §5.17',
      items: [
        shall('In mechanically cooled buildings, keep the indoor dew point at or below 15 °C, occupied or not, whenever the outdoor dew point is higher, checked at the dehumidification design condition with zero solar load.'),
        info('Overnight, for up to 12 hours unoccupied, the indoor relative humidity may instead be held at or below 65%.'),
        shall('Design the building so total outdoor air intake equals or exceeds total exhaust under all conditions, keeping it at net positive pressure.'),
      ],
      novac: 'Check the supply dew point on the psychrometric chart against the 15 °C limit for humid UAE conditions.',
    },
    {
      title: 'Air classes and exhaust', ref: '§5.13, §6.5, Tables 6-2 and 6-3',
      table: {
        head: ['Space', 'Exhaust rate', 'Air class'],
        rows: [
          ['Toilets, public (per WC or urinal)', '25 / 35 L/s', '2'],
          ['Toilets, single occupancy (per room)', '12.5 / 25 L/s', '2'],
          ['Kitchenettes', '1.5 L/s·m²', '2'],
          ['Janitor closets, trash and recycling rooms', '5.0 L/s·m²', '3'],
          ['Copy and printing rooms', '2.5 L/s·m²', '2'],
          ['Parking garages', '3.7 L/s·m²', '2'],
        ],
      },
      items: [
        info('Air leaving each space is classed 1 (low contaminant) to 4 (highly objectionable). Class 1 may be recirculated anywhere, Class 2 only to Class 2–4 spaces, Class 3 only within its own space, and Class 4 never.'),
        shall('Exhaust spaces listed in Table 6-2 at or above the listed rates, keeping their exhaust greater than their supply.'),
        info('Public toilets: the higher rate applies where heavy use is expected. Single-occupancy toilets: the lower rate is allowed with continuous operation during hours of use.'),
      ],
    },
  ],
};

export const A901: Digest = {
  id: 'a901',
  title: 'ASHRAE 90.1-2022: requirements for climate zone 0',
  by: 'ASHRAE and IES',
  edition: 'ANSI/ASHRAE/IES Standard 90.1-2022',
  href: 'https://www.ashrae.org/technical-resources/standards-and-guidelines',
  summary: 'The parts of the energy standard that shape a cooling load in the UAE (climate zone 0B under ASHRAE 169): envelope limits, air leakage, glazing area and orientation, and the HVAC rules that apply in a hot, dry climate. U-values are converted to SI.',
  sections: [
    {
      title: 'Opaque envelope, nonresidential', ref: '§5.5.3, Table 5.5-0',
      table: {
        head: ['Element', 'Maximum U-value, W/m²K'],
        rows: [
          ['Roof, insulation entirely above deck', '0.22 (residential 0.18)'],
          ['Roof, metal building', '0.23'],
          ['Roof, attic and other', '0.15'],
          ['Wall, mass (concrete or block)', '3.29 (residential 0.86)'],
          ['Wall, metal building', '0.53'],
          ['Wall, steel-framed', '0.70'],
          ['Floor, mass', '1.83'],
          ['Opaque door, swinging / nonswinging', '2.10 / 1.76'],
        ],
      },
      items: [
        shall('In climate zones 0–3, roofs need an aged solar reflectance of at least 0.55 with emittance 0.75 (or an SRI of 64), or else the higher insulation of Table 5.5.3.1.4.'),
        shall('In climate zone 0, east-, south- and west-facing walls need a solar reflectance of at least 0.30 over 75% of their opaque area, or at least 30% of the wall area shaded.'),
      ],
      novac: 'The ASHRAE 90.1 options in the envelope step use these limits, and the roof option without a cool roof uses the higher insulation level.',
    },
    {
      title: 'Glazing and skylights', ref: '§5.5.4, Table 5.5-0',
      table: {
        head: ['Element', 'Maximum U-value, W/m²K', 'Maximum SHGC'],
        rows: [
          ['Fixed glazing', '2.84', '0.22'],
          ['Operable glazing', '3.52', '0.20'],
          ['Glazed entrance door', '4.71', '0.20'],
          ['Skylight', '3.97', '0.30'],
        ],
      },
      items: [
        info('These limits apply to vertical glazing up to 40% of the gross wall area and skylights up to 3% of the gross roof area; beyond that the prescriptive path does not apply.'),
        shall('Glazing must have a visible transmittance to SHGC ratio of at least 1.10.'),
        shall('U-value and SHGC are for the whole assembly, frame included.'),
        shall('The west-facing glazing area and the east-facing glazing area must each be no more than a quarter of the total, or meet the area-weighted SHGC alternative for climate zones 0–3.'),
      ],
      novac: 'The envelope step shows the project glazing ratio and roof glazing share.',
    },
    {
      title: 'Air leakage and entrances', ref: '§5.4.3',
      items: [
        shall('Give the whole envelope a continuous air barrier.'),
        shall('Where measured, envelope leakage must not exceed 0.35 cfm/ft² (1.78 L/s·m²) at 75 Pa, tested to ASTM E3158. Buildings under 10,000 ft² (929 m²) must be tested; larger buildings may instead follow an air barrier verification programme.'),
        shall('Entrances from outside into conditioned space need a vestibule with self-closing doors or a revolving door, with doors at least 2.1 m apart.'),
      ],
      novac: 'Infiltration in NOVAC is entered as air changes per hour for each room.',
    },
    {
      title: 'Load calculation and controls', ref: '§6.4.2–6.4.3',
      items: [
        shall('Size systems and equipment from design loads calculated to ASHRAE/ACCA Standard 183; size pumps from the pressure drop of the critical circuit.'),
        shall('Control each zone with its own thermostat. Where one thermostat controls heating and cooling, give it a dead band of at least 2.8 K (5 °F).'),
        shall('Provide off-hour control: a seven-day schedule with a two-hour override, an occupancy sensor that switches off within 30 minutes, a two-hour timer, or a security-system interlock.'),
      ],
      novac: 'NOVAC uses the ASHRAE heat balance method, the most detailed of the methods in ASHRAE Fundamentals Ch. 18.',
    },
    {
      title: 'Economizers and energy recovery', ref: '§6.5.1, §6.5.6.1, Tables 6.5.1-1 and 6.5.6.1.2',
      table: {
        head: ['Outdoor air share of supply', 'Recovery needed above, under 8,000 h/yr', 'Above, 8,000 h/yr or more'],
        rows: [
          ['10–20%', 'Not required', 'Not required'],
          ['20–30%', 'Not required', '9,200 L/s'],
          ['30–40%', 'Not required', '4,250 L/s'],
          ['40–50%', 'Not required', '2,360 L/s'],
          ['50–60%', '12,270 L/s', '1,890 L/s'],
          ['60–70%', '5,660 L/s', '1,420 L/s'],
          ['70–80%', '2,360 L/s', '710 L/s'],
          ['80% and over', '1,890 L/s', '57 L/s'],
        ],
      },
      items: [
        info('Economizers are not required in climate zones 0A and 0B.'),
        shall('Fit exhaust air energy recovery where a fan system\'s supply airflow exceeds the value for climate zone 0B in the table, by its outdoor air share and annual hours; recovery must reach an enthalpy recovery ratio of at least 50% at the cooling design condition.'),
        shall('Long-stay dwelling units need energy recovery ventilation at 50% enthalpy recovery, except units up to 500 ft² (46 m²) in climate zone 0.'),
      ],
      novac: 'NOVAC applies sensible and latent recovery effectiveness to the fresh-air load where an energy recovery unit is selected.',
    },
  ],
};

export const SAFAT_DG: Digest = {
  id: 'safat',
  title: "Al Sa'fat – Dubai Green Building System",
  by: 'Dubai Municipality',
  edition: '2nd edition, January 2023',
  href: 'https://www.dm.gov.ae/documents/al-safat-dubai-green-building-system-2nd-edition/',
  summary: "Dubai's green building system for new buildings. Silver Sa'fa is the minimum for every new building; Golden and Platinum set higher targets. This digest covers the energy and indoor environment requirements that affect cooling loads and HVAC design.",
  sections: [
    {
      title: 'Levels and compliance routes', ref: '201.01–201.03',
      items: [
        info("Silver Sa'fa applies to all new buildings; Golden Sa'fa adds its own requirements, and Platinum adds further ones on top of Golden."),
        info('The regulations cover villas, residential and commercial buildings, public buildings and industrial buildings; each part of a mixed-use building follows the rules for its use.'),
        info("Energy compliance is by the Elemental Method (meet 304.05, 501.01, 502.01 and 502.04 directly) or the Performance Method: an ASHRAE 90.1 Appendix G energy model showing annual energy no higher than a reference building that meets them, keeping Al Sa'fat's own envelope and efficiency limits."),
      ],
    },
    {
      title: 'Walls, roofs and exposed floors', ref: '501.01 A, Table 501.01 (1), 501.02',
      table: {
        head: ['Element', "Silver Sa'fa, max U (W/m²K)", 'Golden and Platinum, max U (W/m²K)'],
        rows: [['Roof', '0.30', '0.30'], ['External wall and exposed floor', '0.57', '0.42']],
      },
      items: [
        shall('U-values are averages over each element. Glazed panels with insulation behind them count as wall.'),
        info('For floors on the ground, insulation is needed only for 1 m in from the building perimeter.'),
        shall('Eliminate or insulate thermal bridges at beams, columns and around openings. For villas, the average U-value of the whole envelope must not exceed 0.40 W/m²K.'),
      ],
      novac: "Selecting an Al Sa'fat code set fills in these wall and roof values, and the envelope step checks entries against them.",
    },
    {
      title: 'Glazing', ref: '501.01 B, Tables 501.01 (2)–(7)',
      table: {
        head: ['Glazing', "Silver: max U / max SC / min light transmittance", 'Golden and Platinum'],
        rows: [
          ['Window-to-wall ratio under 40%', '2.1 / 0.40 / 0.40', '1.9 / 0.32 / 0.32'],
          ['Window-to-wall ratio 40–60%', '1.9 / 0.32 / 0.32', '1.7 / 0.25 / 0.25'],
          ['Window-to-wall ratio over 60%', '1.7 / 0.25 / 0.25', '1.5 / 0.25 / 0.25'],
          ['Shopfronts and showrooms above ground floor', '1.9 / 0.76 / –', '1.9 / 0.76 / –'],
          ['Roof glazing up to 10% of roof area', '1.9 / 0.32 / 0.32', '1.9 / 0.32 / 0.32'],
          ['Roof glazing over 10% of roof area', '1.9 / 0.25 / 0.25', '1.9 / 0.25 / 0.25'],
        ],
      },
      items: [
        shall('Except for shopfronts, glazing must not exceed 40% of the gross wall area in residential buildings or 60% in other buildings.'),
        info('U-values are summer values in W/m²K. The shading coefficient (SC) is about 1.15 times the solar heat gain coefficient (SHGC ≈ 0.87 × SC).'),
        shall("For Silver Sa'fa, orient glazed façades as DBC E.5.2.2 requires; for Golden and Platinum, glazing facing between south-east and south-west (112.5°–247.5°) must be shaded or otherwise treated, unless building-integrated photovoltaics are used."),
      ],
      novac: "The envelope step works out the project's glazing ratio and the Al Sa'fat band it falls in.",
    },
    {
      title: 'Design conditions, airtightness and shading', ref: '501.03–501.06',
      items: [
        shall('Use the Dubai Building Code design conditions (H.4.6.2) and room-by-room load calculation (H.4.6.5); villas follow DBC K.10.1.3.'),
        shall('Protect main entrances with a lobby or door barrier (DBC H.4.9.2).'),
        shall('Buildings with a cooling load of 1 MW or more must leak no more than 5 m³/h per m² at 50 Pa.'),
        shall('Calculate shading effects as DBC E.5.3 (K.7.2.3 for villas) requires.'),
      ],
      novac: 'Selecting Dubai fills in the DBC outdoor, fresh-air and indoor design conditions.',
    },
    {
      title: 'Surfaces and heat island', ref: '304.01–304.04, Table (1) 304.01',
      table: {
        head: ['Surface', 'Minimum solar reflectance index (SRI)'],
        rows: [['Flat and low-sloped roofs (1:6 or flatter)', '78'], ['Steep roofs (steeper than 1:6)', '29'], ['External walls', '29']],
      },
      items: [
        shall('Meet the SRI on at least 75% of the roof area and all external walls.'),
        shall('Mount heat rejection equipment over 4 kW at least 3 m above ground.'),
        info('Platinum: vegetate at least 30% of the roof where the conditions in 304.03 allow.'),
      ],
    },
    {
      title: 'HVAC equipment and energy recovery', ref: '502.01–502.02, 502.10–502.11',
      table: {
        head: ['Requirement', 'Silver', 'Golden', 'Platinum'],
        rows: [
          ['Household AC, ESMA star rating', 'DBC H.4.8.1 minimum', '4 stars or more', '5 stars or more'],
          ['Commercial and central AC efficiency', 'DBC minimum', '10% above DBC', '10% above DBC'],
          ['Energy recovery over 1,000 L/s treated outdoor air: share of exhaust', '50%', '60%', '70%'],
          ['Energy recovery sensible effectiveness', '70%', '75%', '80%'],
        ],
      },
      items: [
        shall('Use demand-controlled ventilation as DBC H.4.8.3 requires.'),
        shall('Insulate refrigerant, chilled and hot water pipes and conditioned-air ducts to DBC H.4.8.4.'),
        info('Golden and Platinum buildings of 1 MW cooling load or more must collect and reuse condensate.'),
      ],
      novac: 'NOVAC applies the energy recovery effectiveness entered for the fresh-air unit and flags rooms that need demand-controlled ventilation.',
    },
    {
      title: 'Controls and systems', ref: '502.08–502.22',
      items: [
        shall('Equip HVAC with efficient zone controls (DBC H.4.14.1) and hotel rooms with occupancy controls (H.4.14.3).'),
        shall('Every new district cooling plant must include thermal energy storage sized to DBC G.3.4.'),
        shall('Design ductwork for low leakage and test it as DBC H.4.12.6 requires; keep a maintenance manual and log to ASHRAE 180.'),
        info('Golden and Platinum: control fresh air with temperature and humidity sensing on a building management system, use pressure-independent control valves on chilled water, and give occupants control of temperature and air speed in each zone, with occupancy sensors and window or door interlocks.'),
        info('Air-conditioned industrial buildings (and, for Golden and Platinum, air-conditioned car parks) must use indirect evaporative cooling, with a design temperature of at least 28 °C, unless they have special requirements.'),
        info('Platinum: cool open corridors and public areas with renewable energy.'),
      ],
    },
    {
      title: 'Indoor environment and metering', ref: '401.01, 402.01, 503.01–503.05',
      items: [
        shall('Ventilate air-conditioned buildings mechanically or in mixed mode to the latest ASHRAE 62.1, 62.2 and 170, with occupancy from DBC B.5.1 where listed.'),
        shall('Provide the comfort range in DBC H.4.7 (K.10.1.4 for villas).'),
        shall('Commission building services in buildings of 1 MW cooling load or more; meter electricity, and meter chilled water to each consumer where cooling comes from a central plant or district cooling.'),
        shall('Provide a central control and monitoring system for buildings of 1 MW cooling load or 5,000 m² gross floor area or more.'),
      ],
      novac: 'Fresh air in NOVAC follows ASHRAE 62.1 with DBC Table B.2 occupancy where listed.',
    },
  ],
};

export const DIGESTS: Digest[] = [CLM, DBC_H4, A621, A901, SAFAT_DG];
