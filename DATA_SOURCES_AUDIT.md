# SevaPath catalogue data audit

Reviewed on 20 November 2026.

Task 04 supplied the names and groupings of 30 entries. The additional descriptions, benefits, procedures, requirements, rules and links in SevaPath are paraphrased from the government portals and publications recorded below and in `backend/app/db/catalogue_task04.json`. Each seeded entry records `task04_user_list` as the origin of its inclusion. The older standalone Caste Certificate and e-Shram listings remain in the catalogue. Existing Income Certificate, National Scholarship Portal and Gruha Lakshmi IDs are reused.

## What verification covers

- A checked source means material from an authoritative publisher was available during the review, either directly or through its indexed government publication. A catalogue verification badge refers to the published entry and its sources. Annual intake, current deadlines, fees and scheme approval require their own evidence.
- Source records carry the URL, publisher type and check date. Individual document requirements, machine-readable eligibility rules and prerequisites carry a source reference. Where the source discusses a particular district, component, cohort or prior cycle, the guidance keeps that scope.
- All 30 opening dates, current deadlines and live intake statuses are unset. The NSP historical entry describes a named 2022–23 award group, and SSP and Yuva Nidhi include scoped historical eligibility guidance. Missing information is shown as “Not verified” or omitted from the applicable list.
- The Karnataka SSP post-matric portal, Karnataka Ahara portal and the PM-KISAN FAQs PDF did not load successfully in the direct check. They remain unchecked references. The PM-KISAN portal and Fiscal Policy Institute publications were reviewed through official indexed material when direct reads timed out. The applicant portal links identify a destination. Availability, login and transactions were outside verification.
- Public fixture and test data are separate from this seed. SevaPath does not connect to a government application, OCR, identity verification, status or notification API.

## Eligibility and document readiness

Eligibility percentages use matched conditions divided by all configured conditions. Unknown conditions remain visible and do not count as matches. All-unknown or unconfigured assessments have no percentage. The initial rules cover PM-KISAN landholding, Gruha Lakshmi’s ration-card household-head condition and pension age checks. Other scheme criteria stay in published guidance pending rules and profile fields.

Document readiness compares the signed-in user's private uploads by self-reported document category and expiry date. An applicable upload with a supplied expiry earlier than the current date in India is flagged as expired. The percentage uses known unconditional requirements as its denominator. Conditional items and categories without a mapping need manual review. A government authority determines whether a document is acceptable. The stored prerequisites cover Income Certificate for SSP awards that require it and a Ration Card for the published Gruha Lakshmi household condition. Additional links such as RTC/Pahani or FRUITS ID need a scheme-level source identifying the prerequisite.

## Source index

Counts are for this seed's source-linked documents and machine-readable rules. A dash denotes a field without seed coverage. Full source records, including supporting and unchecked references, are stored in the seed and exposed by the service detail API.

| Task 04 entry | Area | Category | Primary official source | Document items | Structured rules |
| --- | --- | --- | --- | ---: | ---: |
| PM-KISAN Samman Nidhi | Central | Farmers | [PM-KISAN official portal](https://pmkisan.gov.in/?open_in_new_tab=true) | 1 | 1 |
| Pradhan Mantri Fasal Bima Yojana (PMFBY) | Central | Farmers | [PMFBY revised operational guidelines](https://pmfby.gov.in/pdf/Revised_Operational_Guidelines.pdf?trk=public_post_comment-text) | 4 | — |
| Kisan Credit Card (KCC) | Central | Farmers | [State Bank of India Kisan Credit Card](https://sbi.co.in/web/agri-rural/agriculture-banking/crop-loan/kisan-credit-card) | — | — |
| PM-KUSUM Scheme | Central | Farmers | [National Portal for PM-KUSUM](https://pmkusum.mnre.gov.in/) | — | — |
| Pradhan Mantri Krishi Sinchayee Yojana (PMKSY) | Central | Farmers | [PMKSY programme overview](https://pmksy.mowr.gov.in/pmksy.html) | — | — |
| Sub-Mission on Agricultural Mechanization (SMAM) | Central | Farmers | [SMAM operational guidelines](https://agrimachinery.nic.in/Files/Guidelines/Guidelines_SMAM2024.pdf) | — | — |
| Paramparagat Krishi Vikas Yojana (PKVY) | Central | Farmers | [PIB programme explanation](https://www.pib.gov.in/Pressreleaseshare.aspx?PRID=2099756&lang=2&reg=48) | — | — |
| Soil Health Card Scheme | Central | Farmers | [NIC Soil Health Card Portal project](https://s3af5d5ef24881f3c3049a7b9bfe74d58b.s3waas.gov.in/project/soil-health-card-portal/) | — | — |
| Formation and Promotion of 10,000 FPOs | Central | Farmers | [SFAC operational guidelines](https://sfacindia.com/UploadFile/Statistics/Formation%20%26%20Promotion%20of%2010%2C000%20FPOs%20Scheme%20Operational%20Guidelines%20in%20English.pdf) | — | — |
| National Beekeeping and Honey Mission | Central | Farmers | [PIB National Beekeeping and Honey Mission brief](https://static.pib.gov.in/WriteReadData/specificdocs/documents/2025/nov/doc2025112682601.pdf) | — | — |
| Krishi Bhagya Scheme | Karnataka | Farmers | [Bengaluru Rural Agriculture Department](https://bangalorerural.nic.in/en/agriculture/) | — | — |
| Ganga Kalyana Scheme | Karnataka | Farmers | [Tumakuru district Ganga Kalyana information](https://tumkur.nic.in/en/scheme/ganga-kalyana-scheme-g-k-s/) | — | — |
| Pashu Bhagya Scheme | Karnataka | Farmers | [Gadag district Pashu Bhagya overview](https://gadag.nic.in/en/scheme/pashu-bhagya/) | — | — |
| Farm Mechanization Subsidy – Karnataka | Karnataka | Farmers | [Bengaluru Rural district agriculture department](https://bangalorerural.nic.in/en/agriculture/) | — | — |
| Micro Irrigation Subsidy – Karnataka | Karnataka | Farmers | [Bengaluru South Horticulture Department](https://bengalurusouth.nic.in/en/horticulture-department/) | — | — |
| SSP Post-Matric Scholarship | Karnataka | Students | [Karnataka technical education SSP eligibility and document guidance](https://dtek.karnataka.gov.in/storage/pdf-files/ACM/SSp%20portal301019.pdf) | 3 | — |
| Vidyasiri Scholarship | Karnataka | Students | [Karnataka SSP guidance including Vidyasiri](https://dtek.karnataka.gov.in/storage/pdf-files/ACM/SSp%20portal301019.pdf) | 2 | — |
| Yuva Nidhi Scheme | Karnataka | Students | [Karnataka Fiscal Policy Institute Yuva Nidhi scheme summary](https://fpibengaluru.karnataka.gov.in/uploads/media_to_upload1762775113.pdf) | — | — |
| National Scholarship Portal Scholarships | Central | Students | [National Scholarship Portal](https://scholarships.gov.in/) | — | — |
| Gruha Lakshmi Scheme | Karnataka | Women Empowerment | [Karnataka Fiscal Policy Institute scheme assessment](https://fpibengaluru.karnataka.gov.in/uploads/media_to_upload1762775086.pdf) | 1 | 1 |
| Udyogini Scheme | Karnataka | Women Empowerment | [Bengaluru Rural district Women Development Corporation programme information](https://bangalorerural.nic.in/en/karnataka-state-women-development-corporation/) | — | — |
| Stree Shakti Self-Help Group Scheme | Karnataka | Women Empowerment | [Kodagu district Women and Child Development programmes](https://kodagu.nic.in/en/women-and-child-development-department/) | — | — |
| Bhagyalakshmi Scheme | Karnataka | Women Empowerment | [Gadag district Bhagyalaxmi scheme information](https://gadag.nic.in/en/scheme/bhagyalaxmi/) | — | — |
| Indira Gandhi National Old Age Pension Scheme | Central | Pension | [Government of Nagaland NSAP programme and eligibility](https://dsw.nagaland.gov.in/about-the-national-social-assistance-programme-nsap/) | — | 1 |
| Widow Pension Scheme | Central | Pension | [Government of Nagaland NSAP programme and eligibility](https://dsw.nagaland.gov.in/about-the-national-social-assistance-programme-nsap/) | — | 1 |
| Disability Pension Scheme | Central | Pension | [Government of Nagaland NSAP programme and eligibility](https://dsw.nagaland.gov.in/about-the-national-social-assistance-programme-nsap/) | — | — |
| Ration Card | Karnataka | Other Citizen Services | [National Food Security portal Karnataka resources](https://nfsa.gov.in/State/KA) | — | — |
| Driving Licence | Central | Transport | [Delhi Transport Department permanent licence guidance](https://transport.delhi.gov.in/transport/permanent-driving-licence) | 1 | — |
| Income Certificate | Karnataka | Certificates | [Tumakuru district income certificate instructions](https://tumkur.nic.in/en/service/apply-for-income-certificate/) | 4 | — |
| Caste & Income Certificate | Karnataka | Certificates | [Belagavi district certificate service instructions](https://belagavi.nic.in/en/service/residence-certificate/) | — | — |

