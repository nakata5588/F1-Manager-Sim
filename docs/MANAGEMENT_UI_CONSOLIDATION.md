# Management UI Consolidation

## Purpose

Stage 9 reorganises the existing Management Hub into player-facing workspaces without creating new management authority.

The management browser remains a projection/action surface over the existing Inbox, Board, People, Scouting, Contracts, Market, Staff Recruitment, Commercial, Responsibilities and Manager Career systems.

## Primary workspaces

The Management area now exposes seven top-level player contexts:

- **Inbox**
- **Team**
- **Drivers**
- **Staff**
- **Board**
- **Finances & Sponsors**
- **Career**

Technical workflows are moved into contextual secondary navigation rather than competing as equal top-level tabs.

### Team

- Overview
- Responsibilities

The Team overview uses the existing People projection for current drivers/staff and the existing Board/Responsibilities projections for summary context.

### Drivers

- Current Drivers
- Recruitment
- Contracts
- Market Activity

Current Drivers uses the controlled team's People projection. Recruitment, scouting, negotiations and rival-market activity continue to use their existing systems and endpoints.

### Staff

- Current Staff
- Recruitment & Contracts

Current Staff is now separated from the external staff market. Recruitment & Contracts reuses the existing Staff Recruitment and Staff Contract systems.

### Board

Board confidence, objectives and requests remain unchanged in authority and behaviour.

### Finances & Sponsors

This workspace combines two existing projections:

- current team finances from the controlled Team Profile;
- sponsorship/commercial state from the existing Commercial system.

The UI shows cash, monthly income, monthly expenses, monthly net and financial status alongside sponsor deals, marketability, activities and negotiations. It does not introduce a second finance model or calculate alternative financial state.

### Career

Manager reputation, vacancies, applications, offers and career history remain owned by the existing Manager Career system.

## Career Shell integration

The global Career Shell now links directly to:

- Team -> `/management.html#team`
- Drivers -> `/management.html#drivers`
- Staff -> `/management.html#staff`
- Finances & Sponsors -> `/management.html#commercial`

The shell title remains specific for secondary views such as Driver Contracts, Market Activity, Staff Recruitment & Contracts, Board and Responsibilities.

Legacy `#people` links are accepted and normalized to the Team workspace.

## Hash navigation

Management now reads the URL hash on initial load and reacts to later `hashchange` events.

This closes a previous mismatch where the Career Shell could highlight Drivers or Staff while the Management page itself still displayed Inbox.

Player navigation and internal action flows keep the hash synchronized. For example:

- opening a driver negotiation moves to `#contracts`;
- opening a staff negotiation moves to `#staff-market`;
- opening a sponsor negotiation moves to `#commercial`.

## Authority boundary

Stage 9 does not change:

- Save World schema;
- driver/staff employment rules;
- contract negotiation rules;
- scouting visibility;
- Board logic;
- commercial negotiation rules;
- financial calculations;
- responsibility delegation rules;
- manager-career rules.

The change is information architecture, presentation and navigation only, plus reuse of the existing Team Profile finance projection.
