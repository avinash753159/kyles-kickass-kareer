#!/usr/bin/env python3
"""
Generate tailored resume PDFs for ALL 18 jobs.
Each PDF surgically edits the original, preserving fonts/icons/dots/dividers.
"""
import fitz
import sys
import os

sys.stdout.reconfigure(encoding='utf-8')

INPUT = "KyleGaarder_Resume_0426 (1).pdf"
OUT_DIR = "public/resumes"
os.makedirs(OUT_DIR, exist_ok=True)

# ── Job-specific tailoring data ─────────────────────────────────────────
JOBS = {
    "industrious-product": {
        "file": "Kyle_Resume_Industrious_Product.pdf",
        "subtitle": "Product Leader | Physical Space Innovation | Revenue & Pricing",
        "summary": (
            "Product-minded operator with direct experience launching and scaling "
            "physical space products from zero. Built pricing models, ran A/B "
            "experiments, and grew revenue 48% while maintaining 94% occupancy. "
            "I specialize in 0-1 product launches in physical spaces - coworking, "
            "coliving, and shared environments. My background spans product "
            "strategy, revenue optimization, cross-functional leadership, and "
            "operational scaling."
        ),
        "rv_bullets": [
            "Launched an 8-bedroom coliving property in 2 weeks, reaching 100% occupancy before lease start",
            "A/B tested dynamic pricing models and stay-length diversification, driving 48% annual revenue increase",
            "Maintained 94% occupancy for 19 months through product iteration and community-driven retention",
            "Ran 48 community dinners, 4 mastermind cohorts, and 6 work-trade programs to boost engagement",
            "Directed full-cycle ops from financial reporting to vendor procurement, improving efficiency 212% YoY",
            "Built cross-functional workflows across ops, marketing, and finance to support product launches",
            "Facilitated smooth acquisition transition to Macro House while maintaining stakeholder relationships",
        ],
        "vv_bullets": [
            "Built demand pipeline of 3,140 subscribers through grassroots outreach and concept validation",
            "Conducted 48 customer interviews to guide product-market fit and pricing strategy",
            "Explored partnerships across 5 states and personally secured an investor-backed pilot program",
            "Led product concept development in an early-stage startup across strategy and operations",
        ],
        "ach_titles": [
            "48% Revenue via A/B Pricing",
            "0-1 Physical Product Launch",
            "94% Occupancy for 19 Months",
            "Investor Pilot Secured",
            "Demand Pipeline Built",
        ],
        "ach_descs": [
            "A/B tested dynamic pricing and stay-length diversification, drove 48% annual revenue growth",
            "Launched new coliving product from concept to full occupancy in 2 weeks",
            "Sustained 94% occupancy through product iteration, pricing experiments, and retention programs",
            "Sourced and secured an investor-backed pilot for a new physical space concept across 5 states",
            "Built early demand pipeline of 3,140 subscribers through concept validation and outreach",
        ],
        "skills": [
            ("Product Strategy & Launch", None),
            ("Dynamic Pricing & A/B Testing", None),
            ("Revenue Optimization", None),
            ("Cross-Functional Leadership", None),
            ("Physical Space Operations", "Scaling"),
            ("Data-Driven Decisions", "Analytics"),
            ("Partnerships", "Market Creation"),
        ],
    },
    "kindred-gtm": {
        "file": "Kyle_Resume_Kindred_GTM.pdf",
        "subtitle": "GTM Leader | New Products | Community & Network Growth",
        "summary": (
            "GTM operator and product builder with a track record of 0-1 "
            "product launches and community-driven network growth. I build "
            "trust-based networks from scratch - designing activation systems, "
            "member referral loops, and programs that convert engagement into "
            "durable retention. My background spans marketplace GTM, coliving, "
            "and market creation. I thrive in ambiguous environments, run rapid "
            "experiments across teams, and turn ambitious product bets into "
            "scalable real-world growth systems."
        ),
        "rv_bullets": [
            "Launched an 8-bedroom coliving property in 2 weeks, reaching 100% occupancy before lease start",
            "Designed onboarding, activation, and community loop systems driving 94% occupancy for 19 consecutive months",
            "Built and tested member referral and ambassador programs - community-led acquisition became primary growth channel",
            "Ran 48 community dinners, 4 mastermind cohorts, and 6 work-trade programs, building engagement and retention",
            "Executed A/B testing on dynamic pricing and stay-length diversification, generating a 48% annual revenue lift at 94% occupancy",
            "Directed full-cycle operations, improving efficiency 212% YoY. Facilitated smooth acquisition transition to Macro House",
            "Built member insights engine via interviews and events, synthesizing patterns into GTM and product recommendations",
        ],
        "vv_bullets": [
            "Built demand pipeline of 3,140 subscribers through grassroots community outreach and concept validation",
            "Ran 48 structured customer discovery interviews guiding GTM positioning and go-to-market sequencing",
            "Explored partnerships across 5 states and personally secured an investor-backed pilot program",
            "Led cross-functional execution across strategy, ops, brand, and product in a pre-launch startup environment",
        ],
        "ach_titles": [
            "Circles GTM Launch - DRI Ready",
            "48% Revenue Lift via Experimentation",
            "Rapid Network Launch",
            "Investor Pilot Secured",
            "Demand Pipeline Built",
        ],
        "ach_descs": [
            "Build end-to-end GTM motions for trust-based networks - activation loops, referral programs, community nurture",
            "A/B tested pricing and engagement programs, drove 48% annual revenue growth at sustained occupancy",
            "Launched and filled 8-bed network in 2 weeks, sustained 94% occupancy for 19 months",
            "Sourced and secured an investor-backed pilot for a new community network concept across 5 states",
            "Built early demand pipeline of 3,140 subscribers through concept validation and outreach",
        ],
        "skills": [
            ("GTM Strategy & Launch", None),
            ("Community-Led Growth", None),
            ("Cross-Functional Execution", None),
            ("Channel Experimentation", None),
            ("Member Activation", "Onboarding"),
            ("Lifecycle & Nurture", "Programs"),
            ("Partnerships", "Market Creation"),
        ],
    },
    "commune": {
        "file": "Kyle_Resume_Commune.pdf",
        "subtitle": "Community Operator | Systems Builder | Programming & Events",
        "summary": (
            "Community operator who builds systems from scratch. Designed and ran "
            "every aspect of a coliving community from day one - onboarding, "
            "communications, procurement, vendor management, and programming. "
            "I specialize in creating the operational backbone that makes shared "
            "spaces thrive. My approach combines hands-on facility management "
            "with intentional community design that drives retention and "
            "belonging."
        ),
        "rv_bullets": [
            "Built all operational systems from zero - onboarding, comms, procurement, vendor management",
            "Ran 48 weekly community dinners, 4 mastermind programs, and 6 work-trade programs from scratch",
            "Achieved 212% operational efficiency improvement YoY through process design and iteration",
            "Maintained 94% occupancy through community-driven retention and intentional programming",
            "Designed conflict-resolution and communication systems supporting long-term resident satisfaction",
            "Directed full-cycle facility ops from financial reporting to vendor procurement and maintenance",
            "Facilitated smooth acquisition transition to Macro House while maintaining community continuity",
        ],
        "vv_bullets": [
            "Built demand pipeline of 3,140 subscribers through grassroots community outreach",
            "Conducted 48 customer interviews to understand community needs and validate programming",
            "Explored partnerships across 5 states and personally secured an investor-backed pilot program",
            "Led operations, partnerships, and community concept development in early-stage environment",
        ],
        "ach_titles": [
            "212% Efficiency Improvement",
            "48 Community Programs Built",
            "94% Occupancy via Community",
            "Investor Pilot Secured",
            "Demand Pipeline Built",
        ],
        "ach_descs": [
            "Year-over-year operational efficiency gains through systematic process design and iteration",
            "Designed and ran 48 dinners, 4 masterminds, and 6 work-trade programs from a blank slate",
            "Community-driven retention sustained 94% occupancy for 19 months in an emerging model",
            "Sourced and secured an investor-backed pilot for a new community housing concept across 5 states",
            "Built early demand pipeline of 3,140 subscribers through concept validation and outreach",
        ],
        "skills": [
            ("Community Programming", None),
            ("Systems Design from Zero", None),
            ("Facility Operations", None),
            ("Vendor Procurement", None),
            ("Event Planning", "Facilitation"),
            ("Conflict Resolution", "Comms"),
            ("Partnerships", "Market Creation"),
        ],
    },
    "teero": {
        "file": "Kyle_Resume_Teero.pdf",
        "subtitle": "Operations Leader | P&L Ownership | Multi-Hat Startup Operator",
        "summary": (
            "Early-stage operator with full P&L ownership experience. Built and "
            "scaled operations from zero across multiple ventures - managing "
            "revenue, costs, vendors, and growth simultaneously. I thrive as "
            "a multi-hat operator in ambiguous startup environments. My track "
            "record includes 48% revenue growth via pricing experiments, 212% "
            "efficiency gains, and three 0-1 company builds."
        ),
        "rv_bullets": [
            "Launched an 8-bedroom coliving property in 2 weeks, reaching 100% occupancy before lease start",
            "Owned full P&L - financial reporting, vendor procurement, revenue optimization, cost management",
            "Grew revenue 48% through dynamic pricing A/B tests while maintaining 94% occupancy for 19 months",
            "Ran 48 community programs and 6 work-trade initiatives, building retention and engagement",
            "Improved operational efficiency 212% YoY through systematic process design and rapid iteration",
            "Managed cross-functional operations spanning strategy, product, community, and facility management",
            "Facilitated smooth acquisition transition to Macro House while maintaining positive relationships",
        ],
        "vv_bullets": [
            "Built demand pipeline of 3,140 subscribers through grassroots outreach and concept validation",
            "Conducted 48 customer interviews to guide product-market fit and business model development",
            "Explored partnerships across 5 states and personally secured an investor-backed pilot program",
            "Wore every hat - strategy, ops, partnerships, product, and community in pre-revenue startup",
        ],
        "ach_titles": [
            "Full P&L Ownership",
            "48% Revenue Growth",
            "212% Efficiency Improvement",
            "Investor Pilot Secured",
            "3x 0-1 Company Builder",
        ],
        "ach_descs": [
            "End-to-end financial ownership across revenue, costs, vendors, and growth optimization",
            "A/B tested dynamic pricing and stay-length diversification driving 48% annual revenue lift",
            "Year-over-year operational efficiency gains through process design and systematic iteration",
            "Sourced and secured an investor-backed pilot for a new housing concept across 5 states",
            "Built three companies from zero - coliving, mobile housing, and watercraft services",
        ],
        "skills": [
            ("P&L Management", None),
            ("Multi-Hat Operations", None),
            ("Revenue Optimization", None),
            ("Rapid Experimentation", None),
            ("Vendor Procurement", "Scaling"),
            ("Territory Management", "Growth"),
            ("Partnerships", "Market Creation"),
        ],
    },
    "airbnb": {
        "file": "Kyle_Resume_Airbnb.pdf",
        "subtitle": "Program Manager | Community Support | Cross-Functional Ops",
        "summary": (
            "Community-focused program designer with hands-on experience building "
            "support systems, conflict resolution frameworks, and cross-functional "
            "programs from scratch. I design programs that bridge operations, "
            "community, and product - measuring success by engagement, retention, "
            "and stakeholder satisfaction. My background in coliving gives me "
            "deep empathy for host and guest dynamics."
        ),
        "rv_bullets": [
            "Launched an 8-bedroom coliving property in 2 weeks, reaching 100% occupancy before lease start",
            "Designed conflict-resolution and communication systems supporting long-term resident satisfaction",
            "Ran 48 community programs, 4 masterminds, and 6 work-trade programs driving engagement and retention",
            "Built cross-functional workflows across ops, community, and product to improve resident experience",
            "Maintained 94% occupancy for 19 months through program-driven retention and community design",
            "Directed full-cycle operations, improving efficiency 212% YoY across all functional areas",
            "Facilitated smooth acquisition transition to Macro House while maintaining stakeholder relationships",
        ],
        "vv_bullets": [
            "Built demand pipeline of 3,140 subscribers through grassroots community outreach",
            "Conducted 48 customer interviews to understand user needs and guide program design",
            "Explored partnerships across 5 states and personally secured an investor-backed pilot program",
            "Led cross-functional execution across strategy, ops, and product in early-stage environment",
        ],
        "ach_titles": [
            "Community Program Portfolio",
            "Conflict Resolution Systems",
            "94% Retention via Programs",
            "Investor Pilot Secured",
            "Demand Pipeline Built",
        ],
        "ach_descs": [
            "Designed and ran 48 dinners, 4 masterminds, and 6 work-trade programs from scratch",
            "Built conflict-resolution and communication frameworks supporting long-term satisfaction",
            "Program-driven retention sustained 94% occupancy for 19 months in emerging housing model",
            "Sourced and secured an investor-backed pilot for a new community concept across 5 states",
            "Built early demand pipeline of 3,140 subscribers through concept validation and outreach",
        ],
        "skills": [
            ("Program Management", None),
            ("Community Support Design", None),
            ("Cross-Functional Execution", None),
            ("Conflict Resolution", None),
            ("Stakeholder Management", "KPIs"),
            ("User Research", "Interviews"),
            ("Partnerships", "Market Creation"),
        ],
    },
    "capfactory-events": {
        "file": "Kyle_Resume_CapFactory_Events.pdf",
        "subtitle": "Events & Community Leader | Programming | Shared Spaces",
        "summary": (
            "Community programmer and event designer with a portfolio of 48+ "
            "recurring events, 4 mastermind programs, and 6 work-trade initiatives "
            "built from scratch. I design programming that makes people choose "
            "one space over another. My background in coliving and coworking "
            "gives me deep understanding of how events drive member acquisition, "
            "retention, and community identity."
        ),
        "rv_bullets": [
            "Launched an 8-bedroom coliving property in 2 weeks, reaching 100% occupancy before lease start",
            "Designed and ran 48 weekly community dinners, 4 mastermind cohorts, and 6 work-trade programs",
            "Built programming portfolio that drove 94% occupancy retention for 19 consecutive months",
            "Created onboarding and community loop systems that converted new members into engaged residents",
            "Executed A/B testing on pricing and stay-length models, generating 48% annual revenue lift",
            "Directed full-cycle operations, improving efficiency 212% YoY across events and facility ops",
            "Facilitated smooth acquisition transition to Macro House while maintaining community continuity",
        ],
        "vv_bullets": [
            "Built demand pipeline of 3,140 subscribers through grassroots community outreach",
            "Conducted 48 customer interviews to understand community needs and event preferences",
            "Explored partnerships across 5 states and personally secured an investor-backed pilot program",
            "Led community concept development across strategy, ops, and programming in startup environment",
        ],
        "ach_titles": [
            "48+ Events Built from Scratch",
            "94% Retention via Programming",
            "48% Revenue Growth",
            "Investor Pilot Secured",
            "Demand Pipeline Built",
        ],
        "ach_descs": [
            "Designed and executed 48 dinners, 4 masterminds, and 6 work-trade programs from zero",
            "Event-driven community design sustained 94% occupancy for 19 months",
            "A/B tested pricing and engagement models driving 48% annual revenue increase",
            "Sourced and secured an investor-backed pilot for a new community concept across 5 states",
            "Built early demand pipeline of 3,140 subscribers through concept validation and outreach",
        ],
        "skills": [
            ("Event Design & Production", None),
            ("Community Programming", None),
            ("Member Engagement", None),
            ("Shared Space Operations", None),
            ("Facilitation", "Masterminds"),
            ("Stakeholder Management", "Vendors"),
            ("Partnerships", "Market Creation"),
        ],
    },
    "hipcamp-growth": {
        "file": "Kyle_Resume_Hipcamp_Growth.pdf",
        "subtitle": "Growth Product Manager | Demand Generation | Retention",
        "summary": (
            "Growth-minded builder with proven demand generation and retention "
            "results. Built a 3,140-subscriber pipeline from zero through "
            "grassroots outreach, and maintained 94% occupancy for 19 months "
            "through community-driven retention. I specialize in turning "
            "early-stage products into sustainable growth engines using "
            "experimentation, user research, and engagement loops."
        ),
        "rv_bullets": [
            "Launched an 8-bedroom coliving property in 2 weeks, reaching 100% occupancy before lease start",
            "Built retention engine that sustained 94% occupancy for 19 months through community programming",
            "Designed onboarding and activation loops converting new users into long-term engaged residents",
            "Ran 48 community dinners, 4 mastermind cohorts, and 6 work-trade programs driving engagement",
            "Executed A/B testing on dynamic pricing and stay-length diversification, driving 48% revenue lift at 94% occupancy",
            "Directed full-cycle operations, improving efficiency 212% YoY through growth-focused iteration",
            "Built user insights engine via interviews and events, turning patterns into growth recommendations",
        ],
        "vv_bullets": [
            "Built demand pipeline of 3,140 subscribers through grassroots outreach and concept validation",
            "Conducted 48 customer interviews to guide product-market fit and growth strategy",
            "Explored partnerships across 5 states and personally secured an investor-backed pilot program",
            "Led cross-functional growth execution across strategy, ops, and product in startup environment",
        ],
        "ach_titles": [
            "3,140-Sub Demand Pipeline",
            "94% Retention for 19 Months",
            "48% Revenue via Experiments",
            "Investor Pilot Secured",
            "Rapid Product Launch",
        ],
        "ach_descs": [
            "Built early demand pipeline of 3,140 subscribers from zero through grassroots outreach",
            "Community-driven retention engine sustained 94% occupancy for 19 consecutive months",
            "A/B tested pricing and engagement programs driving 48% annual revenue growth",
            "Sourced and secured an investor-backed pilot for a new community concept across 5 states",
            "Launched coliving product from concept to 100% occupancy in 2 weeks",
        ],
        "skills": [
            ("Growth Strategy", None),
            ("Demand Generation", None),
            ("Retention & Engagement", None),
            ("A/B Testing & Experiments", None),
            ("User Research", "Interviews"),
            ("Lifecycle & Nurture", "Loops"),
            ("Partnerships", "Market Creation"),
        ],
    },
    "kindred-pm": {
        "file": "Kyle_Resume_Kindred_PM.pdf",
        "subtitle": "Product Manager | Community Platforms | Customer Discovery",
        "summary": (
            "Product builder who designs community-driven experiences from "
            "scratch. Conducted 48 customer interviews, launched a coliving "
            "product from zero, and iterated based on real user feedback. "
            "I specialize in community platform products where trust and "
            "belonging are the core value proposition. My approach combines "
            "deep user empathy with rapid experimentation."
        ),
        "rv_bullets": [
            "Launched an 8-bedroom coliving property in 2 weeks, reaching 100% occupancy before lease start",
            "Designed the complete resident experience - onboarding, engagement loops, and retention systems",
            "Built community as the product - 48 dinners, 4 masterminds, and 6 work-trade programs",
            "Ran A/B pricing experiments driving 48% revenue lift while maintaining 94% occupancy",
            "Maintained 94% occupancy for 19 months through continuous product iteration and user feedback",
            "Directed full-cycle operations, improving efficiency 212% YoY through process optimization",
            "Facilitated smooth acquisition transition to Macro House while maintaining user satisfaction",
        ],
        "vv_bullets": [
            "Built demand pipeline of 3,140 subscribers through grassroots outreach and validation",
            "Conducted 48 customer interviews to guide product-market fit and feature prioritization",
            "Explored partnerships across 5 states and personally secured an investor-backed pilot program",
            "Led product concept development across strategy, ops, and community in startup environment",
        ],
        "ach_titles": [
            "48 Customer Interviews",
            "Community Product from Zero",
            "94% Retention via Product",
            "Investor Pilot Secured",
            "Demand Pipeline Built",
        ],
        "ach_descs": [
            "Structured customer discovery program guiding product-market fit and feature decisions",
            "Designed and launched community-based housing product from concept to full occupancy",
            "Product-driven retention sustained 94% occupancy for 19 months in emerging market",
            "Sourced and secured an investor-backed pilot for a new community concept across 5 states",
            "Built early demand pipeline of 3,140 subscribers through concept validation and outreach",
        ],
        "skills": [
            ("Product Management", None),
            ("Customer Discovery", None),
            ("Community Product Design", None),
            ("User Research & Empathy", None),
            ("Rapid Experimentation", "A/B Testing"),
            ("Stakeholder Management", "Specs"),
            ("Partnerships", "Market Creation"),
        ],
    },
    "hipcamp-staff": {
        "file": "Kyle_Resume_Hipcamp_Staff.pdf",
        "subtitle": "Senior Product Manager | Consumer Experience | Retention",
        "summary": (
            "Experience designer who builds complete customer journeys from "
            "scratch. Designed the entire resident experience at a coliving "
            "property - onboarding, engagement, and retention - achieving 94% "
            "occupancy for 19 months. I obsess over experience, test constantly, "
            "and measure success by whether people come back."
        ),
        "rv_bullets": [
            "Launched an 8-bedroom coliving property in 2 weeks, reaching 100% occupancy before lease start",
            "Designed complete customer experience from scratch - onboarding, engagement, conflict resolution",
            "Built retention engine sustaining 94% occupancy for 19 months through experience iteration",
            "Ran 48 community dinners, 4 masterminds, and 6 programs, synthesizing feedback into improvements",
            "Executed A/B testing on pricing and stay-length models, driving 48% revenue lift at 94% occupancy",
            "Directed full-cycle operations, improving efficiency 212% YoY through experience-driven optimization",
            "Built insights engine via member interviews and events, turning patterns into product decisions",
        ],
        "vv_bullets": [
            "Built demand pipeline of 3,140 subscribers through grassroots outreach and validation",
            "Conducted 48 customer interviews to understand user needs and journey pain points",
            "Explored partnerships across 5 states and personally secured an investor-backed pilot program",
            "Led consumer experience development across strategy, ops, and product in startup environment",
        ],
        "ach_titles": [
            "Complete CX from Scratch",
            "94% Retention via Experience",
            "48% Revenue via Experiments",
            "Investor Pilot Secured",
            "Demand Pipeline Built",
        ],
        "ach_descs": [
            "Designed end-to-end customer experience - onboarding, engagement, retention, and resolution",
            "Experience-driven retention sustained 94% occupancy for 19 consecutive months",
            "A/B tested pricing and engagement programs driving 48% annual revenue growth",
            "Sourced and secured an investor-backed pilot for a new community concept across 5 states",
            "Built early demand pipeline of 3,140 subscribers through concept validation and outreach",
        ],
        "skills": [
            ("Consumer Experience Design", None),
            ("Retention & Engagement", None),
            ("User Research & Synthesis", None),
            ("A/B Testing & Experiments", None),
            ("Journey Mapping", "Onboarding"),
            ("Stakeholder Management", "Analytics"),
            ("Partnerships", "Market Creation"),
        ],
    },
    "drillbit": {
        "file": "Kyle_Resume_Drillbit.pdf",
        "subtitle": "Operations Leader | Systems & Efficiency | Full-Cycle Ops",
        "summary": (
            "Operations leader building efficient systems from zero. Achieved "
            "212% efficiency improvement YoY through systematic process design. "
            "I specialize in full-cycle operations management - financial "
            "reporting, vendor procurement, revenue optimization, and team "
            "coordination. Three-time founder with a track record of building "
            "operational infrastructure in early-stage environments."
        ),
        "rv_bullets": [
            "Launched an 8-bedroom coliving property in 2 weeks, reaching 100% occupancy before lease start",
            "Improved operational efficiency 212% YoY through systematic process design and automation",
            "Directed full-cycle ops - financial reporting, vendor procurement, revenue optimization",
            "Built operational systems from scratch - onboarding, communications, scheduling, maintenance",
            "Executed A/B testing on dynamic pricing and stay-length models, driving 48% annual revenue lift at 94% occupancy",
            "Maintained 94% occupancy for 19 months through operationally-driven retention systems",
            "Facilitated smooth acquisition transition to Macro House while maintaining operational continuity",
        ],
        "vv_bullets": [
            "Built demand pipeline of 3,140 subscribers through grassroots outreach and validation",
            "Conducted 48 customer interviews to guide operational model and process design",
            "Explored partnerships across 5 states and personally secured an investor-backed pilot program",
            "Led operations, strategy, and process development in early-stage startup environment",
        ],
        "ach_titles": [
            "212% Efficiency Improvement",
            "Full-Cycle Ops from Zero",
            "48% Revenue Growth",
            "Investor Pilot Secured",
            "Demand Pipeline Built",
        ],
        "ach_descs": [
            "Year-over-year operational efficiency gains through process design and systematic iteration",
            "Built complete operational infrastructure from scratch across multiple ventures",
            "A/B tested pricing and operational models driving 48% annual revenue increase",
            "Sourced and secured an investor-backed pilot for a new housing concept across 5 states",
            "Built early demand pipeline of 3,140 subscribers through concept validation and outreach",
        ],
        "skills": [
            ("Operations Management", None),
            ("Process Automation", None),
            ("Financial Reporting", None),
            ("Vendor Procurement", None),
            ("Efficiency Optimization", "Systems"),
            ("Cross-Functional Ops", "Scaling"),
            ("Partnerships", "Market Creation"),
        ],
    },
    "homeward": {
        "file": "Kyle_Resume_Homeward.pdf",
        "subtitle": "Product Manager | Housing Innovation | Experimentation",
        "summary": (
            "Product-minded housing operator who has designed, tested, and "
            "iterated on residential products. I bring hands-on experience "
            "in the housing industry - launching a coliving product from zero, "
            "running pricing experiments, and building retention systems. "
            "My approach combines deep housing knowledge with rapid product "
            "experimentation and data-driven decision making."
        ),
        "rv_bullets": [
            "Launched an 8-bedroom coliving property in 2 weeks, reaching 100% occupancy before lease start",
            "A/B tested dynamic pricing and stay-length diversification, driving 48% annual revenue increase",
            "Maintained 94% occupancy for 19 months through product iteration and resident experience design",
            "Built onboarding, engagement, and retention systems supporting long-term resident satisfaction",
            "Ran 48 community programs, 4 masterminds, and 6 work-trade initiatives driving engagement",
            "Directed full-cycle operations, improving efficiency 212% YoY through housing ops optimization",
            "Facilitated smooth acquisition transition to Macro House while maintaining resident continuity",
        ],
        "vv_bullets": [
            "Built demand pipeline of 3,140 subscribers through grassroots outreach and validation",
            "Conducted 48 customer interviews to guide housing product-market fit and positioning",
            "Explored partnerships across 5 states and personally secured an investor-backed pilot program",
            "Led housing product development across strategy, ops, and concept validation",
        ],
        "ach_titles": [
            "Housing Product from Zero",
            "48% Revenue via Experiments",
            "94% Occupancy for 19 Months",
            "Investor Pilot Secured",
            "Demand Pipeline Built",
        ],
        "ach_descs": [
            "Designed and launched residential product from concept to full occupancy in 2 weeks",
            "A/B tested pricing and engagement models driving 48% annual revenue growth",
            "Product-driven retention sustained 94% occupancy for 19 months in emerging market",
            "Sourced and secured an investor-backed pilot for a new housing concept across 5 states",
            "Built early demand pipeline of 3,140 subscribers through concept validation and outreach",
        ],
        "skills": [
            ("Housing Product Strategy", None),
            ("Rapid Experimentation", None),
            ("Pricing & Revenue Models", None),
            ("Resident Experience Design", None),
            ("Customer Research", "Interviews"),
            ("Data-Driven Decisions", "A/B Tests"),
            ("Partnerships", "Market Creation"),
        ],
    },
    "industrious-mem": {
        "file": "Kyle_Resume_Industrious_MEM.pdf",
        "subtitle": "Member Experience Designer | Community Programming | Ops",
        "summary": (
            "Member experience designer who builds community programming from "
            "scratch. Designed and ran the complete resident experience at a "
            "coliving property - 48 weekly events, 4 mastermind programs, and "
            "6 work-trade initiatives. I specialize in creating intentional, "
            "relationship-driven, operationally excellent member experiences "
            "in shared spaces."
        ),
        "rv_bullets": [
            "Launched an 8-bedroom coliving property in 2 weeks, reaching 100% occupancy before lease start",
            "Designed complete member experience - onboarding, engagement, retention, and conflict resolution",
            "Ran 48 weekly community dinners, 4 mastermind cohorts, and 6 work-trade programs from scratch",
            "Built community-driven retention sustaining 94% occupancy for 19 consecutive months",
            "Executed A/B pricing experiments driving 48% revenue lift while maintaining member satisfaction",
            "Directed full-cycle operations, improving efficiency 212% YoY across all member touchpoints",
            "Facilitated smooth acquisition transition while maintaining community trust and continuity",
        ],
        "vv_bullets": [
            "Built demand pipeline of 3,140 subscribers through grassroots community outreach",
            "Conducted 48 customer interviews to understand member needs and experience preferences",
            "Explored partnerships across 5 states and personally secured an investor-backed pilot program",
            "Led member experience design across strategy, ops, and community in startup environment",
        ],
        "ach_titles": [
            "Complete MX from Scratch",
            "48+ Community Programs",
            "94% Retention via Experience",
            "Investor Pilot Secured",
            "Demand Pipeline Built",
        ],
        "ach_descs": [
            "Designed end-to-end member experience - onboarding, engagement, events, and resolution",
            "Built 48 dinners, 4 masterminds, and 6 work-trade programs driving member engagement",
            "Experience-driven retention sustained 94% occupancy for 19 consecutive months",
            "Sourced and secured an investor-backed pilot for a new community concept across 5 states",
            "Built early demand pipeline of 3,140 subscribers through concept validation and outreach",
        ],
        "skills": [
            ("Member Experience Design", None),
            ("Community Programming", None),
            ("Operational Excellence", None),
            ("Event Design & Facilitation", None),
            ("Retention Strategies", "Onboarding"),
            ("Conflict Resolution", "Comms"),
            ("Partnerships", "Market Creation"),
        ],
    },
    "capfactory-mentor": {
        "file": "Kyle_Resume_CapFactory_Mentor.pdf",
        "subtitle": "Community Facilitator | Relationship Management | Programs",
        "summary": (
            "Community facilitator who has designed masterminds, managed 140+ "
            "client relationships, and built connection-driven programs from "
            "scratch. I specialize in fostering meaningful relationships at "
            "scale - matching people, facilitating growth, and measuring "
            "outcomes. As a founder, I understand both sides of mentorship."
        ),
        "rv_bullets": [
            "Launched an 8-bedroom coliving property in 2 weeks, reaching 100% occupancy before lease start",
            "Designed and facilitated 4 mastermind programs and 6 work-trade initiatives from scratch",
            "Ran 48 weekly community dinners building relationships and fostering resident connections",
            "Built retention systems sustaining 94% occupancy for 19 months through relationship-driven design",
            "Executed A/B pricing experiments driving 48% revenue lift while maintaining community quality",
            "Directed full-cycle operations, improving efficiency 212% YoY through systematic coordination",
            "Facilitated smooth acquisition transition while maintaining stakeholder relationships",
        ],
        "vv_bullets": [
            "Built demand pipeline of 3,140 subscribers through grassroots relationship outreach",
            "Conducted 48 structured interviews to understand needs and build partnership foundations",
            "Explored partnerships across 5 states and personally secured an investor-backed pilot program",
            "Led relationship management across strategy, ops, and community in startup environment",
        ],
        "ach_titles": [
            "Mastermind Program Designer",
            "140+ Client Relationships",
            "94% Retention via Relationships",
            "Investor Pilot Secured",
            "Demand Pipeline Built",
        ],
        "ach_descs": [
            "Designed 4 mastermind cohorts and 6 structured programs facilitating growth and connection",
            "Built and managed 140+ concurrent client relationships with 82% retention rate",
            "Relationship-driven design sustained 94% occupancy for 19 consecutive months",
            "Sourced and secured an investor-backed pilot for a new community concept across 5 states",
            "Built early demand pipeline of 3,140 subscribers through concept validation and outreach",
        ],
        "skills": [
            ("Facilitation & Masterminds", None),
            ("Relationship Management", None),
            ("Program Design & KPIs", None),
            ("Community Building", None),
            ("Mentorship Coordination", "Matching"),
            ("Stakeholder Management", "Events"),
            ("Partnerships", "Market Creation"),
        ],
    },
    "closinglock": {
        "file": "Kyle_Resume_Closinglock.pdf",
        "subtitle": "Customer Success Leader | Retention & Relationships | Growth",
        "summary": (
            "Customer success leader with 82% retention across 140+ client "
            "relationships. I build my career on keeping customers - through "
            "relationship-driven service, proactive engagement, and systematic "
            "retention programs. My background spans housing, community, and "
            "service businesses where long-term relationships drive growth."
        ),
        "rv_bullets": [
            "Launched an 8-bedroom coliving property in 2 weeks, reaching 100% occupancy before lease start",
            "Designed onboarding and retention systems sustaining 94% occupancy for 19 consecutive months",
            "Ran 48 community programs, 4 masterminds, and 6 initiatives driving engagement and satisfaction",
            "Built systematic communication and conflict-resolution frameworks for long-term relationships",
            "Executed A/B pricing experiments driving 48% revenue lift while maintaining high satisfaction",
            "Directed full-cycle operations, improving efficiency 212% YoY through client-focused optimization",
            "Facilitated smooth acquisition transition while maintaining positive client relationships",
        ],
        "vv_bullets": [
            "Built demand pipeline of 3,140 subscribers through grassroots relationship outreach",
            "Conducted 48 customer interviews to understand satisfaction drivers and retention factors",
            "Explored partnerships across 5 states and personally secured an investor-backed pilot program",
            "Led customer relationship strategy across operations and community in startup environment",
        ],
        "ach_titles": [
            "82% Customer Retention",
            "140+ Client Relationships",
            "94% Occupancy via Retention",
            "Investor Pilot Secured",
            "Demand Pipeline Built",
        ],
        "ach_descs": [
            "Achieved 82% customer retention through relationship-driven service across 140+ clients",
            "Built and managed concurrent client relationships with proactive engagement programs",
            "Retention-driven systems sustained 94% occupancy for 19 months in emerging market",
            "Sourced and secured an investor-backed pilot for a new community concept across 5 states",
            "Built early demand pipeline of 3,140 subscribers through concept validation and outreach",
        ],
        "skills": [
            ("Customer Success", None),
            ("Retention & Churn Prevention", None),
            ("Relationship Management", None),
            ("Onboarding & Adoption", None),
            ("Client Communication", "Comms"),
            ("Conflict Resolution", "Support"),
            ("Partnerships", "Market Creation"),
        ],
    },
    "vuka": {
        "file": "Kyle_Resume_Vuka.pdf",
        "subtitle": "Community Builder | Sales & Relationships | Event Programming",
        "summary": (
            "Community builder and relationship-driven seller. Closed 30-40 "
            "new clients per summer through direct outreach and referrals, "
            "achieving 46% YoY revenue growth. I bring both the community "
            "instinct and the sales hustle - building programming that attracts "
            "members and relationships that keep them."
        ),
        "rv_bullets": [
            "Launched an 8-bedroom coliving property in 2 weeks, reaching 100% occupancy before lease start",
            "Designed community programming that drove 94% occupancy retention for 19 consecutive months",
            "Ran 48 weekly community dinners, 4 masterminds, and 6 work-trade programs from scratch",
            "Built onboarding and engagement loops converting new members into long-term residents",
            "Executed A/B pricing experiments driving 48% revenue lift while maintaining community quality",
            "Directed full-cycle operations, improving efficiency 212% YoY across community and facility ops",
            "Facilitated smooth acquisition transition while maintaining member trust and community identity",
        ],
        "vv_bullets": [
            "Built demand pipeline of 3,140 subscribers through grassroots community outreach",
            "Conducted 48 customer interviews to understand member needs and community preferences",
            "Explored partnerships across 5 states and personally secured an investor-backed pilot program",
            "Led community sales and membership growth across strategy, ops, and programming",
        ],
        "ach_titles": [
            "30-40 Clients per Summer",
            "46% YoY Revenue Growth",
            "94% Retention via Community",
            "Investor Pilot Secured",
            "Demand Pipeline Built",
        ],
        "ach_descs": [
            "Closed 30-40 new clients per summer through direct outreach, referrals, and relationships",
            "Generated 46% year-over-year revenue growth through pricing, operations, and service",
            "Community-driven programming sustained 94% occupancy for 19 consecutive months",
            "Sourced and secured an investor-backed pilot for a new community concept across 5 states",
            "Built early demand pipeline of 3,140 subscribers through concept validation and outreach",
        ],
        "skills": [
            ("Community Sales", None),
            ("Event Programming", None),
            ("Membership Growth", None),
            ("Relationship-Driven Sales", None),
            ("Direct Outreach", "Referrals"),
            ("Engagement & Retention", "Events"),
            ("Partnerships", "Market Creation"),
        ],
    },
    "industrious-events": {
        "file": "Kyle_Resume_Industrious_Events.pdf",
        "subtitle": "Community Events Leader | Marketing & Growth | Programming",
        "summary": (
            "Community event designer and growth operator. Built a portfolio of "
            "48+ events, 4 masterminds, and 6 structured programs from scratch. "
            "I design programming that drives member satisfaction and acquisition "
            "in shared spaces. My background combines event production with "
            "growth marketing - building demand pipelines and converting "
            "attendees into long-term members."
        ),
        "rv_bullets": [
            "Launched an 8-bedroom coliving property in 2 weeks, reaching 100% occupancy before lease start",
            "Designed and produced 48 weekly dinners, 4 mastermind cohorts, and 6 work-trade programs",
            "Built event-driven growth engine sustaining 94% occupancy retention for 19 consecutive months",
            "Created member onboarding and engagement loops driving satisfaction and long-term retention",
            "Executed A/B testing on pricing and event models, generating 48% annual revenue lift",
            "Directed full-cycle operations, improving efficiency 212% YoY across events and facility ops",
            "Facilitated smooth acquisition transition while maintaining programming continuity",
        ],
        "vv_bullets": [
            "Built demand pipeline of 3,140 subscribers through grassroots marketing and outreach",
            "Conducted 48 customer interviews to understand community preferences and event demand",
            "Explored partnerships across 5 states and personally secured an investor-backed pilot program",
            "Led marketing and community growth across strategy, ops, and brand in startup environment",
        ],
        "ach_titles": [
            "48+ Events from Scratch",
            "3,140-Sub Growth Pipeline",
            "94% Retention via Events",
            "Investor Pilot Secured",
            "48% Revenue Growth",
        ],
        "ach_descs": [
            "Designed and produced 48 dinners, 4 masterminds, and 6 programs driving community growth",
            "Built early demand pipeline of 3,140 subscribers through grassroots marketing and outreach",
            "Event-driven community design sustained 94% occupancy for 19 consecutive months",
            "Sourced and secured an investor-backed pilot for a new community concept across 5 states",
            "A/B tested pricing and engagement models driving 48% annual revenue increase",
        ],
        "skills": [
            ("Event Design & Production", None),
            ("Community Marketing", None),
            ("Growth & Demand Generation", None),
            ("Brand Programming", None),
            ("Member Acquisition", "Retention"),
            ("Stakeholder Management", "Vendors"),
            ("Partnerships", "Market Creation"),
        ],
    },
    "clipboard": {
        "file": "Kyle_Resume_Clipboard.pdf",
        "subtitle": "Strategy & Operations | Generalist Operator | Systems Builder",
        "summary": (
            "Generalist operator building organizational systems from scratch. "
            "Three-time founder with a track record of 212% efficiency gains, "
            "48% revenue growth, and multi-hat execution across strategy, ops, "
            "product, and community. I thrive in ambiguous environments where "
            "the playbook has not been written yet."
        ),
        "rv_bullets": [
            "Launched an 8-bedroom coliving property in 2 weeks, reaching 100% occupancy before lease start",
            "Built all operational systems from zero - onboarding, comms, procurement, financial reporting",
            "Improved efficiency 212% YoY through systematic process design and rapid iteration",
            "Ran 48 community programs, 4 masterminds, and 6 initiatives across multiple functions",
            "Executed A/B testing on dynamic pricing and stay-length diversification, driving 48% revenue lift at 94% occupancy",
            "Managed cross-functional operations spanning strategy, product, community, and facility ops",
            "Facilitated smooth acquisition transition to Macro House while maintaining operational continuity",
        ],
        "vv_bullets": [
            "Built demand pipeline of 3,140 subscribers through grassroots outreach and validation",
            "Conducted 48 customer interviews to guide strategy and operational model development",
            "Explored partnerships across 5 states and personally secured an investor-backed pilot program",
            "Wore every hat - strategy, ops, partnerships, product, and community in early-stage startup",
        ],
        "ach_titles": [
            "212% Efficiency Improvement",
            "3x Company Builder",
            "48% Revenue Growth",
            "Investor Pilot Secured",
            "Demand Pipeline Built",
        ],
        "ach_descs": [
            "Year-over-year operational efficiency gains through process design and systematic iteration",
            "Built three companies from zero across coliving, mobile housing, and watercraft services",
            "A/B tested pricing and operational models driving 48% annual revenue increase",
            "Sourced and secured an investor-backed pilot for a new housing concept across 5 states",
            "Built early demand pipeline of 3,140 subscribers through concept validation and outreach",
        ],
        "skills": [
            ("Strategy & Operations", None),
            ("Systems Design from Zero", None),
            ("Multi-Hat Execution", None),
            ("Process Optimization", None),
            ("Cross-Functional Leadership", "Ops"),
            ("Rapid Experimentation", "A/B Tests"),
            ("Partnerships", "Market Creation"),
        ],
    },
    "sonder": {
        "file": "Kyle_Resume_Sonder.pdf",
        "subtitle": "General Manager | Hospitality Operations | P&L Leadership",
        "summary": (
            "Hospitality operator with end-to-end property management experience. "
            "Ran the full-stack operation at a residential coliving property - "
            "P&L ownership, guest experience, revenue growth, and operational "
            "efficiency. I specialize in turning properties into thriving "
            "communities through intentional experience design and "
            "operationally-driven growth."
        ),
        "rv_bullets": [
            "Launched an 8-bedroom coliving property in 2 weeks, reaching 100% occupancy before lease start",
            "Owned full P&L - revenue, costs, vendor management, and financial reporting",
            "Designed complete guest experience - onboarding, engagement, satisfaction, and retention",
            "Maintained 94% occupancy for 19 months through experience-driven retention and community",
            "Executed A/B testing on dynamic pricing, driving 48% annual revenue lift at 94% occupancy",
            "Improved operational efficiency 212% YoY across all property management functions",
            "Facilitated smooth acquisition transition to Macro House while maintaining guest satisfaction",
        ],
        "vv_bullets": [
            "Built demand pipeline of 3,140 subscribers through grassroots outreach and validation",
            "Conducted 48 customer interviews to understand guest experience needs and preferences",
            "Explored partnerships across 5 states and personally secured an investor-backed pilot program",
            "Led hospitality operations across strategy, guest experience, and market development",
        ],
        "ach_titles": [
            "Full P&L Ownership",
            "94% Occupancy for 19 Months",
            "48% Revenue Growth",
            "Investor Pilot Secured",
            "Demand Pipeline Built",
        ],
        "ach_descs": [
            "End-to-end financial ownership across revenue, costs, vendors, and growth optimization",
            "Experience-driven retention sustained 94% occupancy for 19 consecutive months",
            "A/B tested pricing and stay-length models driving 48% annual revenue increase",
            "Sourced and secured an investor-backed pilot for a new hospitality concept across 5 states",
            "Built early demand pipeline of 3,140 subscribers through concept validation and outreach",
        ],
        "skills": [
            ("Property Management", None),
            ("P&L Leadership", None),
            ("Guest Experience Design", None),
            ("Revenue Optimization", None),
            ("Hospitality Operations", "Scaling"),
            ("Vendor Management", "Procurement"),
            ("Partnerships", "Market Creation"),
        ],
    },
}


# ── PDF editing function ────────────────────────────────────────────────
def generate_resume(job_id, job_data):
    doc = fitz.open(INPUT)
    page = doc[0]

    # Extract fonts
    fonts = {}
    for f in page.get_fonts(full=True):
        xref, name = f[0], f[3]
        try:
            fd = doc.extract_font(xref)
            if fd and fd[3]:
                fonts[name] = fitz.Font(fontbuffer=fd[3])
        except:
            pass

    ir = fonts["AAAAAA+Inter-Regular"]
    rm = fonts["BAAAAA+Rubik-Medium"]
    ib = fonts["CAAAAA+Inter-Bold"]

    BLUE = (0, 0x8c/255, 1.0)
    DGRAY = (0x3e/255, 0x3e/255, 0x3e/255)
    BLACK = (0, 0, 0)
    WHITE = (1, 1, 1)
    LH = 10.15
    BX, BW = 60.5, 260
    AX, AW = 386.3, 162

    def tw_wrap(tw, x, y, mw, text, font, sz, lh):
        words, line, cy = text.split(' '), '', y
        for w in words:
            t = f"{line} {w}".strip()
            if font.text_length(t, fontsize=sz) > mw and line:
                tw.append((x, cy), line, font=font, fontsize=sz)
                cy += lh; line = w
            else:
                line = t
        if line:
            tw.append((x, cy), line, font=font, fontsize=sz)
            cy += lh
        return cy

    # Redact
    page.add_redact_annot(fitz.Rect(48.8, 68.0, 370, 86.0), fill=WHITE)
    page.add_redact_annot(fitz.Rect(48.8, 141.0, 335, 228.0), fill=WHITE)
    page.add_redact_annot(fitz.Rect(56.5, 308.0, 335, 474.0), fill=WHITE)
    page.add_redact_annot(fitz.Rect(56.5, 523.0, 335, 608.0), fill=WHITE)
    page.add_redact_annot(fitz.Rect(386.0, 141.0, 555, 403.0), fill=WHITE)
    page.add_redact_annot(fitz.Rect(366.0, 444.0, 555, 635.0), fill=WHITE)
    page.apply_redactions(images=fitz.PDF_REDACT_IMAGE_NONE, graphics=0)

    # Subtitle
    tw_s = fitz.TextWriter(page.rect)
    tw_s.append((48.8, 82.0), job_data["subtitle"], font=rm, fontsize=12.1)
    tw_s.write_text(page, color=BLUE)

    # Body text
    tw_b = fitz.TextWriter(page.rect)
    tw_wrap(tw_b, 48.8, 153.5, 280, job_data["summary"], ir, 8.2, LH)

    rv_y = [309.8, 330.1, 350.4, 370.7, 391.0, 421.4, 451.9]
    for i, bt in enumerate(job_data["rv_bullets"]):
        tw_wrap(tw_b, BX, rv_y[i], BW, bt, ir, 8.2, LH)

    vv_y = [524.8, 545.1, 565.4, 585.7]
    for i, bt in enumerate(job_data["vv_bullets"]):
        tw_wrap(tw_b, BX, vv_y[i], BW, bt, ir, 8.2, LH)

    ach_desc_y = [168.8, 216.3, 274.1, 331.8, 379.4]
    for i, desc in enumerate(job_data["ach_descs"]):
        tw_wrap(tw_b, AX, ach_desc_y[i], AW, desc, ir, 8.2, LH)

    skill_y = [448.1, 472.8, 497.6, 522.3, 547.1, 571.8, 596.5]
    for i, (s1, s2) in enumerate(job_data["skills"]):
        tw_b.append((366.6, skill_y[i]), s1, font=ib, fontsize=8.9)
        if s2:
            w1 = ib.text_length(s1, fontsize=8.9)
            tw_b.append((366.6 + w1 + 18, skill_y[i]), s2, font=ib, fontsize=8.9)

    tw_b.write_text(page, color=DGRAY)

    # Achievement titles
    tw_t = fitz.TextWriter(page.rect)
    ach_title_y = [155.0, 203.0, 261.0, 318.5, 366.0]
    for i, title in enumerate(job_data["ach_titles"]):
        tw_t.append((AX, ach_title_y[i]), title, font=ib, fontsize=9.5)
    tw_t.write_text(page, color=BLACK)

    out = os.path.join(OUT_DIR, job_data["file"])
    doc.save(out, garbage=3, deflate=True, clean=True)
    doc.close()
    return out


# ── Generate all ────────────────────────────────────────────────────────
print(f"Generating {len(JOBS)} tailored resumes...\n")
for jid, jdata in JOBS.items():
    path = generate_resume(jid, jdata)
    print(f"  OK  {jid:25s} -> {path}")

print(f"\nDone! {len(JOBS)} PDFs in {OUT_DIR}/")
