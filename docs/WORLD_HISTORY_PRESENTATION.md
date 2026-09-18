# F1 World / History Presentation

## Purpose

Stage 10 turns the existing F1 World projection into a persistent world-browsing workspace.

The player can move between:

- **Overview**
- **News**
- **Drivers**
- **Teams**
- **History**
- **Records**

These are presentation views over the evolving career world. They are not independent simulation systems.

## Historical rule

The project rule remains:

**Historical starting conditions, dynamic alternative future.**

F1 World therefore distinguishes between:

1. the visible current world;
2. events that have already happened inside this save;
3. records and championship history created by this save.

It does not populate future pages from real-world future results, transfers, champions or hidden future entity pools.

## Current world directory

`/api/world` now enriches the already-visible active driver/team lists with current career context.

### Drivers

For each currently visible driver the presentation may show:

- name;
- nationality;
- current team;
- current role;
- employment status;
- championship position;
- championship points;
- championship wins.

Current employment comes from the existing employment state. Championship context comes from the existing Championship projection.

### Teams

For each currently visible active team the presentation may show:

- current name;
- nationality;
- number of currently employed active drivers;
- Constructors' Championship position;
- points;
- wins.

No team strength, hidden rating or future competitive order is exposed.

## Overview

The World Overview combines existing read-only projections:

- active teams/drivers;
- races already archived;
- archived championships;
- current championship leaders;
- latest generated news;
- recent world-history events;
- accumulated milestones.

The UI explicitly states that the archive contains events created by the current career.

## News

News is sourced from the existing world narrative system.

The browser can filter currently returned stories by category for presentation only. Filtering does not mutate or regenerate stories.

Stories retain:

- date;
- category;
- importance;
- headline;
- summary;
- supported entity references.

## History

World History is the chronological projection of `saveWorld.history.events`.

The presentation groups already-recorded events by season. It does not infer missing historical events or backfill future real-world events.

## Records

Career records remain derived from authoritative persisted history:

- `history.races`;
- `history.championships`;
- `history.records`.

The Records view presents:

- driver starts / wins / podiums / championships;
- constructor starts / wins / podiums / championships;
- alternative championship archive;
- simulation-created milestones and firsts.

The UI never hardcodes a real future champion.

## Career Shell integration

All World subviews remain one global `F1 World` navigation destination.

The Career Shell header reflects the selected detail view:

- F1 World / Overview
- F1 World / News
- F1 World / Drivers
- F1 World / Teams
- F1 World / History
- F1 World / Records

This is presentation-only hash navigation.

## Entity visibility

The World directory is built only from current visible arrays:

- `world.drivers`;
- `world.teams`.

Raw hidden pools such as `futureDrivers`, `futureTeams`, `futureStaff`, `futureSponsors` or `futureEntities` are not returned as directory content.

Entity links are limited to profile types currently supported by the profile surface: drivers, teams and staff.

## Authority boundary

Stage 10 does not change:

- Historical Database source data;
- Save World schema;
- race results;
- championship scoring;
- employment rules;
- transfers;
- career development;
- retirement logic;
- generated news/history logic;
- record-generation rules.

The only server-side change enriches the read-only active-world projection by joining current employment and championship context that already exists.
