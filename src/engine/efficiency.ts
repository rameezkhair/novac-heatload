import type { Project } from './types';

export interface EfficiencyGuidance { authority: string; target: string; source: string; href: string; eer?: number; seer?: number; note: string }

/* Ratings are kept at their published test conditions. EER(T1), EER(T3), SEER and CSPF are not interchangeable. */
export function efficiencyGuidance(p: Project, capacityKw: number): EfficiencyGuidance {
  if (p.location === 'rak') {
    if (p.acType === 'vrf') {
      const c = capacityKw;
      const cspf = c < 40 ? 14.84 : c < 220 ? 13.78 : 13.25;
      return { authority: 'RAK Municipality · Barjeel V1.3', target: `VRF CSPF ≥ ${cspf} at T3`, source: 'Barjeel V1.3 301.03 / 401.03, Tables 5 and 13', href: 'https://reem.rak.ae/strategy/policies-regulations/green-building-regulations-barjeel/', seer: cspf, note: 'VRF seasonal rating is CSPF, not SEER. Use the certified product rating.' };
    }
    const eer = p.acType === 'split' ? 8.31 : capacityKw < 40 ? 8.80 : capacityKw < 70 ? 8.59 : capacityKw < 223 ? 8.27 : 7.95;
    return { authority: 'RAK Municipality · Barjeel V1.3', target: `Minimum EER ${eer} Btu/Wh at T3 (COP ${ (eer / 3.412).toFixed(2) })`, source: p.acType === 'split' ? 'Barjeel V1.3 Tables 4 and 12, non-ducted AC' : 'Barjeel V1.3 Tables 4 and 12, ducted split / packaged', href: 'https://reem.rak.ae/strategy/policies-regulations/green-building-regulations-barjeel/', eer, note: 'T3 is the high ambient rating condition. Use this minimum only for the listed equipment class.' };
  }
  if (p.location === 'abudhabi' || p.location === 'alain') {
    if (capacityKw < 65_000 / 3412.14 && p.acType === 'split') return {
      authority: 'Abu Dhabi DMT · ADIECC 2013', target: 'Split AC < 65,000 Btu/h: EER ≥ 12.5 and SEER ≥ 15.0', source: 'ADIECC 2013 §506.2, Table 506.2(1)', href: 'https://www.dmt.gov.ae/-/media/Project/DMT/DMT/Codes/3-ADIECC-2013_1-12-2013.pdf', seer: 15,
      note: 'This published table uses its stated AHRI rating basis, not UAE T3. Confirm the current permit edition and use a T3 product rating for hot-weather power estimates.' };
    return {
      authority: 'Abu Dhabi DMT · ADIECC 2013', target: 'See capacity-tier EER/IPLV minimums in ADIECC Table 506.2(1)', source: 'ADIECC 2013 §506.2', href: 'https://www.dmt.gov.ae/-/media/Project/DMT/DMT/Codes/3-ADIECC-2013_1-12-2013.pdf',
      note: 'The published table has different capacity tiers and rating conditions. Confirm current DMT requirements; enter a certified T3 EER for power estimates.' };
  }
  if (p.location === 'dubai') return {
    authority: 'Dubai Municipality · DBC H.4.8.1 / Al Sa’fat 2023',
    target: p.acType === 'split' ? 'Use current UAE.S 5010-1 product label; Al Sa’fat Golden: ≥4 stars, Platinum: ≥5 stars' : 'Use current UAE.S 5010-5 minimum; Al Sa’fat Golden/Platinum: ≥10% above minimum or variable-flow type',
    source: 'DBC H.4.8.1; Al Sa’fat 502.01', href: 'https://www.dm.gov.ae/municipality-business/planning-and-construction/dubai-building-code-2/',
    note: 'DEWA is the electricity utility, not the authority that sets HVAC equipment design EER limits. Enter the certified T3 EER from the selected product to estimate power.' };
  return {
    authority: 'UAE federal · MOIAT / UAE.S; local authority approval applies',
    target: 'Select equipment certified to the current UAE.S 5010-1 (low capacity) or UAE.S 5010-5 (large capacity) regulation and verify the local permit basis',
    source: 'Cabinet Resolution 157/2025, UAE.S 5010-1:2025 and UAE.S 5010-5:2025', href: 'https://uaelegislation.gov.ae/en/legislations/3862/download',
    note: 'No local numerical HVAC EER table was located in the public sources for this emirate. DEWA/SEWA are utilities; confirm the approving municipality’s current project requirements.'
  };
}
