// ==UserScript==
// @name         SC背景图案替换+换回旧建筑图案
// @namespace    https://github.com/gangbaRuby
// @version      2.3.0
// @license      AGPL-3.0
// @description  SC背景图案替换+换回旧建筑图案
// @author       Rabbit House
// @match        *://www.simcompanies.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=simcompanies.com
// @updateURL    https://sc.22-7.top/scripts/oldBuildingsGraphic.user.js
// @downloadURL  https://sc.22-7.top/scripts/oldBuildingsGraphic.user.js
// @grant        GM_registerMenuCommand
// @grant        unsafeWindow
// ==/UserScript==

(function () {
    'use strict';
    let hasNewVersion, latestVersion;
    let localVersion = GM_info.script.version;

    // ==========================================
    // 1. 全局配置与常量
    // ==========================================
    const CONSTANTS = {
        CDN_BASE: 'https://scimg.22-7.top/images/',
        STATIC_ROOT: 'https://www.simcompanies.com/static/',
        STORAGE_KEY: 'SC_SKIN_SETTINGS',
        THEME_KEY: 'SC_USER_THEME'
    };

    // 需要移除的遮挡物关键词
    const OVERLAY_KEYWORDS = [
        'forrest_nursery_tier01_front',
        'forrest_nursery_tier02_front',
        'forrest_nursery_tier03_front',
        'forrest_nursery_tier04_front',
    ];

    const DEFAULT_PATH_MAP = {
        "hangar_tier01.png": "images/buildings/production/hangar_tier01.png",
        "hangar_tier02.png": "images/buildings/production/hangar_tier02.png",
        "hangar_tier03.png": "images/buildings/production/hangar_tier03.png",
        "hangar_tier04.png": "images/buildings/production/hangar_tier04.png",
        "hangar_tier05.png": "images/buildings/production/hangar_tier05.png",
        "hangar_tier06.png": "images/buildings/production/hangar_tier06.png",
        "carfactory-lvl1.png": "images/landscape/carfactory-lvl1.png",
        "carfactory-lvl2.png": "images/landscape/carfactory-lvl2.png",
        "car-dealership-lvl1.png": "images/landscape/car-dealership-lvl1.png",
        "car-dealership-lvl2.png": "images/landscape/car-dealership-lvl2.png",
        "castle-lvl1.png": "images/landscape/recreational/castle-lvl1.png",
        "castle-lvl2.png": "images/landscape/recreational/castle-lvl2.png",
        "castle-lvl3.png": "images/landscape/recreational/castle-lvl3.png",
        "park-lvl1.png": "images/landscape/recreational/park-lvl1.png",
        "park-lvl2.png": "images/landscape/recreational/park-lvl2.png",
        "park-lvl3.png": "images/landscape/recreational/park-lvl3.png",
        "lake2-lvl1.png": "images/landscape/recreational/lake2-lvl1.png",
        "lake2-lvl2.png": "images/landscape/recreational/lake2-lvl2.png",
        "lake2-lvl3.png": "images/landscape/recreational/lake2-lvl3.png",
        "beverage_factory_tier01.png": "images/buildings/production/beverage_factory_tier01.png",
        "beverage_factory_tier02.png": "images/buildings/production/beverage_factory_tier02.png",
        "beverage_factory_tier03.png": "images/buildings/production/beverage_factory_tier03.png",
        "beverage_factory_tier04.png": "images/buildings/production/beverage_factory_tier04.png",
        "aerospace_factory_tier01.png": "images/buildings/production/aerospace_factory_tier01.png",
        "aerospace_factory_tier02.png": "images/buildings/production/aerospace_factory_tier02.png",
        "aerospace_factory_tier03.png": "images/buildings/production/aerospace_factory_tier03.png",
        "aerospace_factory_tier04.png": "images/buildings/production/aerospace_factory_tier04.png",
        "aerospace_factory_tier05.png": "images/buildings/production/aerospace_factory_tier05.png",
        "aerospace_factory_tier06.png": "images/buildings/production/aerospace_factory_tier06.png",
        "aerospace_electronics_tier01.png": "images/buildings/production/aerospace_electronics_tier01.png",
        "aerospace_electronics_tier02.png": "images/buildings/production/aerospace_electronics_tier02.png",
        "aerospace_electronics_tier03.png": "images/buildings/production/aerospace_electronics_tier03.png",
        "aerospace_electronics_tier04.png": "images/buildings/production/aerospace_electronics_tier04.png",
        "aerospace_electronics_tier05.png": "images/buildings/production/aerospace_electronics_tier05.png",
        "aerospace_electronics_tier06.png": "images/buildings/production/aerospace_electronics_tier06.png",
        "vertical_integration_facility_tier01.png": "images/buildings/production/vertical_integration_facility_tier01.png",
        "vertical_integration_facility_tier02.png": "images/buildings/production/vertical_integration_facility_tier02.png",
        "vertical_integration_facility_tier03.png": "images/buildings/production/vertical_integration_facility_tier03.png",
        "vertical_integration_facility_tier04.png": "images/buildings/production/vertical_integration_facility_tier04.png",
        "vertical_integration_facility_tier05.png": "images/buildings/production/vertical_integration_facility_tier05.png",
        "vertical_integration_facility_tier06.png": "images/buildings/production/vertical_integration_facility_tier06.png",
        "farm_tier01.png": "images/buildings/production/farm_tier01.png",
        "farm_tier02.png": "images/buildings/production/farm_tier02.png",
        "farm_tier03.png": "images/buildings/production/farm_tier03.png",
        "farm_tier04.png": "images/buildings/production/farm_tier04.png",
        "water_reservoir_tier01.png": "images/buildings/production/water_reservoir_tier01.png",
        "water_reservoir_tier02.png": "images/buildings/production/water_reservoir_tier02.png",
        "water_reservoir_tier03.png": "images/buildings/production/water_reservoir_tier03.png",
        "water_reservoir_tier04.png": "images/buildings/production/water_reservoir_tier04.png",
        "water_reservoir_tier05.png": "images/buildings/production/water_reservoir_tier05.png",
        "water_reservoir_tier06.png": "images/buildings/production/water_reservoir_tier06.png",
        "power_plant_tier01.png": "images/buildings/production/power_plant_tier01.png",
        "power_plant_tier02.png": "images/buildings/production/power_plant_tier02.png",
        "power_plant_tier03.png": "images/buildings/production/power_plant_tier03.png",
        "power_plant_tier04.png": "images/buildings/production/power_plant_tier04.png",
        "power_plant_tier05.png": "images/buildings/production/power_plant_tier05.png",
        "power_plant_tier06.png": "images/buildings/production/power_plant_tier06.png",
        "oil_rig_tier01.png": "images/buildings/production/oil_rig_tier01.png",
        "oil_rig_tier02.png": "images/buildings/production/oil_rig_tier02.png",
        "oil_rig_tier03.png": "images/buildings/production/oil_rig_tier03.png",
        "oil_rig_tier04.png": "images/buildings/production/oil_rig_tier04.png",
        "oil_rig_tier05.png": "images/buildings/production/oil_rig_tier05.png",
        "oil_rig_tier06.png": "images/buildings/production/oil_rig_tier06.png",
        "refinery_tier01.png": "images/buildings/production/refinery_tier01.png",
        "refinery_tier02.png": "images/buildings/production/refinery_tier02.png",
        "refinery_tier03.png": "images/buildings/production/refinery_tier03.png",
        "refinery_tier04.png": "images/buildings/production/refinery_tier04.png",
        "shipping_depot_tier01.png": "images/buildings/production/shipping_depot_tier01.png",
        "shipping_depot_tier02.png": "images/buildings/production/shipping_depot_tier02.png",
        "shipping_depot_tier03.png": "images/buildings/production/shipping_depot_tier03.png",
        "shipping_depot_tier04.png": "images/buildings/production/shipping_depot_tier04.png",
        "grocery_store_idle_tier01.png": "images/buildings/sales/grocery_store_idle_tier01.png",
        "grocery_store_idle_tier02.png": "images/buildings/sales/grocery_store_idle_tier02.png",
        "grocery_store_idle_tier03.png": "images/buildings/sales/grocery_store_idle_tier03.png",
        "grocery_store_idle_tier04.png": "images/buildings/sales/grocery_store_idle_tier04.png",
        "grocery_store_idle_tier05.png": "images/buildings/sales/grocery_store_idle_tier05.png",
        "grocery_store_idle_tier06.png": "images/buildings/sales/grocery_store_idle_tier06.png",
        "gas_station_tier01.png": "images/buildings/sales/gas_station_tier01.png",
        "gas_station_tier02.png": "images/buildings/sales/gas_station_tier02.png",
        "gas_station_tier03.png": "images/buildings/sales/gas_station_tier03.png",
        "gas_station_tier04.png": "images/buildings/sales/gas_station_tier04.png",
        "ranch_tier01.png": "images/buildings/production/ranch_tier01.png",
        "ranch_tier02.png": "images/buildings/production/ranch_tier02.png",
        "ranch_tier03.png": "images/buildings/production/ranch_tier03.png",
        "ranch_tier04.png": "images/buildings/production/ranch_tier04.png",
        "mine_tier01.png": "images/buildings/production/mine_tier01.png",
        "mine_tier02.png": "images/buildings/production/mine_tier02.png",
        "mine_tier03.png": "images/buildings/production/mine_tier03.png",
        "mine_tier04.png": "images/buildings/production/mine_tier04.png",
        "mine_tier05.png": "images/buildings/production/mine_tier05.png",
        "mine_tier06.png": "images/buildings/production/mine_tier06.png",
        "factory_tier01.png": "images/buildings/production/factory_tier01.png",
        "factory_tier02.png": "images/buildings/production/factory_tier02.png",
        "factory_tier03.png": "images/buildings/production/factory_tier03.png",
        "factory_tier04.png": "images/buildings/production/factory_tier04.png",
        "factory_tier05.png": "images/buildings/production/factory_tier05.png",
        "factory_tier06.png": "images/buildings/production/factory_tier06.png",
        "electronics_factory_tier01.png": "images/buildings/production/electronics_factory_tier01.png",
        "electronics_factory_tier02.png": "images/buildings/production/electronics_factory_tier02.png",
        "electronics_factory_tier03.png": "images/buildings/production/electronics_factory_tier03.png",
        "electronics_factory_tier04.png": "images/buildings/production/electronics_factory_tier04.png",
        "electronics_factory_tier05.png": "images/buildings/production/electronics_factory_tier05.png",
        "electronics_factory_tier06.png": "images/buildings/production/electronics_factory_tier06.png",
        "clothsfactory-lvl1.png": "images/landscape/clothsfactory-lvl1.png",
        "clothsfactory-lvl2.png": "images/landscape/clothsfactory-lvl2.png",
        "fashion-lvl1.png": "images/landscape/fashion-lvl1.png",
        "fashion-lvl2.png": "images/landscape/fashion-lvl2.png",
        "plantresearch.png": "images/landscape/plantresearch.png",
        "physics-lab-lvl1.png": "images/landscape/physics-lab-lvl1.png",
        "physics-lab-lvl2.png": "images/landscape/physics-lab-lvl2.png",
        "physics-lab-lvl3.png": "images/landscape/physics-lab-lvl3.png",
        "breeding-research-lvl1.png": "images/landscape/breeding-research-lvl1.png",
        "breeding-research-lvl2.png": "images/landscape/breeding-research-lvl2.png",
        "breeding-research-lvl3.png": "images/landscape/breeding-research-lvl3.png",
        "chemistry-research-lvl1.png": "images/landscape/chemistry-research-lvl1.png",
        "chemistry-research-lvl2.png": "images/landscape/chemistry-research-lvl2.png",
        "chemistry-research-lvl3.png": "images/landscape/chemistry-research-lvl3.png",
        "swresearch.png": "images/landscape/swresearch.png",
        "race-track-lvl1.png": "images/landscape/race-track-lvl1.png",
        "race-track-lvl2.png": "images/landscape/race-track-lvl2.png",
        "race-track-lvl3.png": "images/landscape/race-track-lvl3.png",
        "fashion-research-lvl1.png": "images/landscape/fashion-research-lvl1.png",
        "fashion-research-lvl3.png": "images/landscape/fashion-research-lvl3.png",
        "launchpad-lvl1.png": "images/landscape/launchpad-lvl1.png",
        "launchpad-lvl2.png": "images/landscape/launchpad-lvl2.png",
        "launchpad-lvl3.png": "images/landscape/launchpad-lvl3.png",
        "kitchen-lvl1.png": "images/landscape/kitchen-lvl1.png",
        "kitchen-lvl2.png": "images/landscape/kitchen-lvl2.png",
        "kitchen-lvl3.png": "images/landscape/kitchen-lvl3.png",
        "propulsion_factory_tier01.png": "images/buildings/production/propulsion_factory_tier01.png",
        "propulsion_factory_tier02.png": "images/buildings/production/propulsion_factory_tier02.png",
        "propulsion_factory_tier03.png": "images/buildings/production/propulsion_factory_tier03.png",
        "propulsion_factory_tier04.png": "images/buildings/production/propulsion_factory_tier04.png",
        "propulsion_factory_tier05.png": "images/buildings/production/propulsion_factory_tier05.png",
        "propulsion_factory_tier06.png": "images/buildings/production/propulsion_factory_tier06.png",
        "sales_offices_tier01.png": "images/buildings/sales/sales_offices_tier01.png",
        "sales_offices_tier02.png": "images/buildings/sales/sales_offices_tier02.png",
        "sales_offices_tier03.png": "images/buildings/sales/sales_offices_tier03.png",
        "sales_offices_tier04.png": "images/buildings/sales/sales_offices_tier04.png",
        "sales_offices_tier05.png": "images/buildings/sales/sales_offices_tier05.png",
        "sales_offices_tier06.png": "images/buildings/sales/sales_offices_tier06.png",
        "quarry_tier01.png": "images/buildings/production/quarry_tier01.png",
        "quarry_tier02.png": "images/buildings/production/quarry_tier02.png",
        "quarry_tier03.png": "images/buildings/production/quarry_tier03.png",
        "quarry_tier04.png": "images/buildings/production/quarry_tier04.png",
        "quarry_tier05.png": "images/buildings/production/quarry_tier05.png",
        "quarry_tier06.png": "images/buildings/production/quarry_tier06.png",
        "concrete_plant_tier01.png": "images/buildings/production/concrete_plant_tier01.png",
        "concrete_plant_tier02.png": "images/buildings/production/concrete_plant_tier02.png",
        "concrete_plant_tier03.png": "images/buildings/production/concrete_plant_tier03.png",
        "concrete_plant_tier04.png": "images/buildings/production/concrete_plant_tier04.png",
        "concrete_plant_tier05.png": "images/buildings/production/concrete_plant_tier05.png",
        "concrete_plant_tier06.png": "images/buildings/production/concrete_plant_tier06.png",
        "construction_factory_tier01.png": "images/buildings/production/construction_factory_tier01.png",
        "construction_factory_tier02.png": "images/buildings/production/construction_factory_tier02.png",
        "construction_factory_tier03.png": "images/buildings/production/construction_factory_tier03.png",
        "construction_factory_tier04.png": "images/buildings/production/construction_factory_tier04.png",
        "construction_factory_tier05.png": "images/buildings/production/construction_factory_tier05.png",
        "construction_factory_tier06.png": "images/buildings/production/construction_factory_tier06.png",
        "general_contractor_tier01.png": "images/buildings/production/general_contractor_tier01.png",
        "general_contractor_tier02.png": "images/buildings/production/general_contractor_tier02.png",
        "general_contractor_tier03.png": "images/buildings/production/general_contractor_tier03.png",
        "general_contractor_tier04.png": "images/buildings/production/general_contractor_tier04.png",
        "general_contractor_tier05.png": "images/buildings/production/general_contractor_tier05.png",
        "general_contractor_tier06.png": "images/buildings/production/general_contractor_tier06.png",
        "hardware_store_tier01.png": "images/buildings/sales/hardware_store_tier01.png",
        "hardware_store_tier02.png": "images/buildings/sales/hardware_store_tier02.png",
        "hardware_store_tier03.png": "images/buildings/sales/hardware_store_tier03.png",
        "hardware_store_tier04.png": "images/buildings/sales/hardware_store_tier04.png",
        "hardware_store_tier05.png": "images/buildings/sales/hardware_store_tier05.png",
        "hardware_store_tier06.png": "images/buildings/sales/hardware_store_tier06.png",
        "bank-lvl1.png": "images/landscape/bank-lvl1.png",
        "bank-lvl2.png": "images/landscape/bank-lvl2.png",
        "bank-lvl3.png": "images/landscape/bank-lvl3.png",
        "slaughterhouse-lvl1.png": "images/landscape/slaughterhouse-lvl1.png",
        "slaughterhouse-lvl2.png": "images/landscape/slaughterhouse-lvl2.png",
        "slaughterhouse-lvl3.png": "images/landscape/slaughterhouse-lvl3.png",
        "mill_tier01.png": "images/buildings/production/mill_tier01.png",
        "mill_tier02.png": "images/buildings/production/mill_tier02.png",
        "mill_tier03.png": "images/buildings/production/mill_tier03.png",
        "mill_tier04.png": "images/buildings/production/mill_tier04.png",
        "mill_tier05.png": "images/buildings/production/mill_tier05.png",
        "mill_tier06.png": "images/buildings/production/mill_tier06.png",
        "bakery-lvl1.png": "images/landscape/bakery-lvl1.png",
        "bakery-lvl2.png": "images/landscape/bakery-lvl2.png",
        "bakery-lvl3.png": "images/landscape/bakery-lvl3.png",
        "food-processing-lvl1.png": "images/landscape/food-processing-lvl1.png",
        "food-processing-lvl2.png": "images/landscape/food-processing-lvl2.png",
        "food-processing-lvl3.png": "images/landscape/food-processing-lvl3.png",
        "catering-lvl1.png": "images/landscape/catering-lvl1.png",
        "catering-lvl2.png": "images/landscape/catering-lvl2.png",
        "catering-lvl3.png": "images/landscape/catering-lvl3.png",
        "restaurant-low-lvl1.png": "images/landscape/restaurant-low-lvl1.png",
        "restaurant-low-lvl2.png": "images/landscape/restaurant-low-lvl2.png",
        "restaurant-low-lvl3.png": "images/landscape/restaurant-low-lvl3.png",
        "autumn-market-lvl1.png": "images/landscape/autumn-market-lvl1.png",
        "autumn-market-lvl2.png": "images/landscape/autumn-market-lvl2.png",
        "autumn-market-lvl3.png": "images/landscape/autumn-market-lvl3.png",
        "xmas-market-lvl1.png": "images/landscape/xmas-market-lvl1.png",
        "xmas-market-lvl2.png": "images/landscape/xmas-market-lvl2.png",
        "xmas-market-lvl3.png": "images/landscape/xmas-market-lvl3.png",
        "forrest_nursery_tier01_back.png": "images/buildings/production/forrest_nursery_tier01_back.png",
        "forrest_nursery_tier02_back.png": "images/buildings/production/forrest_nursery_tier02_back.png",
        "forrest_nursery_tier03_back.png": "images/buildings/production/forrest_nursery_tier03_back.png",
        "forrest_nursery_tier04_back.png": "images/buildings/production/forrest_nursery_tier04_back.png",
        "academy-lvl1.png": "images/landscape/academy-lvl1.png",
        "academy-lvl2.png": "images/landscape/academy-lvl2.png",
        "academy-lvl3.png": "images/landscape/academy-lvl3.png",
        "academy-lvl4.png": "images/landscape/academy-lvl4.png",
        "academy-lvl5.png": "images/landscape/academy-lvl5.png",
        "beach-market-lvl1.png": "images/landscape/beach-market-lvl1.png",
        "beach-market-lvl2.png": "images/landscape/beach-market-lvl2.png",
        "beach-market-lvl3.png": "images/landscape/beach-market-lvl3.png",
        "spring_market_tier01.png": "images/buildings/seasonal/spring_market_tier01.png",
        "spring_market_tier02.png": "images/buildings/seasonal/spring_market_tier02.png",
        "spring_market_tier03.png": "images/buildings/seasonal/spring_market_tier03.png",

        "sc_background_main_dark_2k_v2.png": "images/sc_background_main_dark_2k_v2.png",
        "sc_background_main_light_2k_v2.png": "images/sc_background_main_light_2k_v2.png",

        "concrete-0000.png": "images/buildings/tiles/concrete-0000.png",
        "concrete-0001.png": "images/buildings/tiles/concrete-0001.png",
        "concrete-0010.png": "images/buildings/tiles/concrete-0010.png",
        "concrete-0011.png": "images/buildings/tiles/concrete-0011.png",
        "concrete-0100.png": "images/buildings/tiles/concrete-0100.png",
        "concrete-0110.png": "images/buildings/tiles/concrete-0110.png",
        "concrete-1000.png": "images/buildings/tiles/concrete-1000.png",
        "concrete-1001.png": "images/buildings/tiles/concrete-1001.png",
        "concrete-1100.png": "images/buildings/tiles/concrete-1100.png",
        "concrete-1111.png": "images/buildings/tiles/concrete-1111.png",

        "intersection.png": "images/buildings/roads/intersection.png",
        "road-left-00.png": "images/buildings/roads/road-left-00.png",
        "road-left-01.png": "images/buildings/roads/road-left-01.png",
        "road-left-10.png": "images/buildings/roads/road-left-10.png",
        "road-00.png": "images/buildings/roads/road-00.png",
        "road-01.png": "images/buildings/roads/road-01.png",
        "road-10.png": "images/buildings/roads/road-10.png",

        "BFR.png": "images/resources/BFR.png",
        "aero-research.png": "images/resources/aero-research.png",
        "aluminium.png": "images/resources/aluminium.png",
        "apple-cider.png": "images/resources/apple-cider.png",
        "apple-pie.png": "images/resources/apple-pie.png",
        "apples.png": "images/resources/apples.png",
        "attitude-control.png": "images/resources/attitude-control.png",
        "automotive-research.png": "images/resources/automotive-research.png",
        "batteries.png": "images/resources/batteries.png",
        "bauxite.png": "images/resources/bauxite.png",
        "bread.png": "images/resources/bread.png",
        "breeding-research.png": "images/resources/breeding-research.png",
        "bricks.png": "images/resources/bricks.png",
        "bulldozer.png": "images/resources/bulldozer.png",
        "butter.png": "images/resources/butter.png",
        "car-body.png": "images/resources/car-body.png",
        "car-interior.png": "images/resources/car-interior.png",
        "carbon-composite.png": "images/resources/carbon-composite.png",
        "carbon-fiber.png": "images/resources/carbon-fiber.png",
        "cement.png": "images/resources/cement.png",
        "cheese.png": "images/resources/cheese.png",
        "chemicals.png": "images/resources/chemicals.png",
        "chemistry-research.png": "images/resources/chemistry-research.png",
        "chocolate.png": "images/resources/chocolate.png",
        "clay.png": "images/resources/clay.png",
        "cockpit.png": "images/resources/cockpit.png",
        "cocktails.png": "images/resources/cocktails.png",
        "cocoa-beans.png": "images/resources/cocoa-beans.png",
        "coffee-beans.png": "images/resources/coffee-beans.png",
        "coffee-ground.png": "images/resources/coffee-ground.png",
        "combustion-engine.png": "images/resources/combustion-engine.png",
        "construction-units.png": "images/resources/construction-units.png",
        "cotton.png": "images/resources/cotton.png",
        "cow.png": "images/resources/cow.png",
        "cream-egg.png": "images/resources/cream-egg.png",
        "crude-oil.png": "images/resources/crude-oil.png",
        "diesel.png": "images/resources/diesel.png",
        "displays.png": "images/resources/displays.png",
        "dough.png": "images/resources/dough.png",
        "dress.png": "images/resources/dress.png",
        "easter-bunny.png": "images/resources/easter-bunny.png",
        "economy-car.png": "images/resources/economy-car.png",
        "economy-e-car.png": "images/resources/economy-e-car.png",
        "eggs.png": "images/resources/eggs.png",
        "electric-motor.png": "images/resources/electric-motor.png",
        "electronic-components.png": "images/resources/electronic-components.png",
        "electronics-research.png": "images/resources/electronics-research.png",
        "energy-research.png": "images/resources/energy-research.png",
        "ethanol.png": "images/resources/ethanol.png",
        "fabric.png": "images/resources/fabric.png",
        "fashion-research.png": "images/resources/fashion-research.png",
        "flight-computer.png": "images/resources/flight-computer.png",
        "flour.png": "images/resources/flour.png",
        "fodder.png": "images/resources/fodder.png",
        "fuel-tank.png": "images/resources/fuel-tank.png",
        "fuselage.png": "images/resources/fuselage.png",
        "ginger-beer.png": "images/resources/ginger-beer.png",
        "glass.png": "images/resources/glass.png",
        "gloves.png": "images/resources/gloves.png",
        "gold-ore.png": "images/resources/gold-ore.png",
        "gold-watch.png": "images/resources/gold-watch.png",
        "golden-bars.png": "images/resources/golden-bars.png",
        "grain.png": "images/resources/grain.png",
        "grapes.png": "images/resources/grapes.png",
        "gravy-boat.png": "images/resources/gravy-boat.png",
        "hamburger.png": "images/resources/hamburger.png",
        "handbags.png": "images/resources/handbags.png",
        "heat-shield.png": "images/resources/heat-shield.png",
        "high-grade-e-components.png": "images/resources/high-grade-e-components.png",
        "icecream-apple.png": "images/resources/icecream-apple.png",
        "icecream-chocolate.png": "images/resources/icecream-chocolate.png",
        "ion-drive.png": "images/resources/ion-drive.png",
        "iron-ore.png": "images/resources/iron-ore.png",
        "jack-o-lantern.png": "images/resources/jack-o-lantern.png",
        "jet-engine.png": "images/resources/jet-engine.png",
        "jumbojet.png": "images/resources/jumbojet.png",
        "jumbojet2.png": "images/resources/jumbojet2.png",
        "laptops.png": "images/resources/laptops.png",
        "lasagna.png": "images/resources/lasagna.png",
        "leather.png": "images/resources/leather.png",
        "limestone.png": "images/resources/limestone.png",
        "luxury-car-interior.png": "images/resources/luxury-car-interior.png",
        "luxury-car.png": "images/resources/luxury-car.png",
        "luxury-e-car.png": "images/resources/luxury-e-car.png",
        "materials-research.png": "images/resources/materials-research.png",
        "meatballs.png": "images/resources/meatballs.png",
        "methane.png": "images/resources/methane.png",
        "milk.png": "images/resources/milk.png",
        "minerals.png": "images/resources/minerals.png",
        "mining-research.png": "images/resources/mining-research.png",
        "monitors.png": "images/resources/monitors.png",
        "necklace.png": "images/resources/necklace.png",
        "oil.png": "images/resources/oil.png",
        "on-board-computer.png": "images/resources/on-board-computer.png",
        "orange-juice.png": "images/resources/orange-juice.png",
        "oranges.png": "images/resources/oranges.png",
        "orbital-booster.png": "images/resources/orbital-booster.png",
        "pasta.png": "images/resources/pasta.png",
        "petrol.png": "images/resources/petrol.png",
        "pig.png": "images/resources/pig.png",
        "pizza.png": "images/resources/pizza.png",
        "planks.png": "images/resources/planks.png",
        "plant-research.png": "images/resources/plant-research.png",
        "plastic.png": "images/resources/plastic.png",
        "power.png": "images/resources/power.png",
        "private-jet.png": "images/resources/private-jet.png",
        "processors.png": "images/resources/processors.png",
        "pumpkin-soup.png": "images/resources/pumpkin-soup.png",
        "pumpkin.png": "images/resources/pumpkin.png",
        "quadcopter.png": "images/resources/quadcopter.png",
        "ramadan-sweets.png": "images/resources/ramadan-sweets.png",
        "recipes.png": "images/resources/recipes.png",
        "reinforced-concrete.png": "images/resources/reinforced-concrete.png",
        "robots.png": "images/resources/robots.png",
        "rocket-engine.png": "images/resources/rocket-engine.png",
        "rocket-fuel.png": "images/resources/rocket-fuel.png",
        "salad.png": "images/resources/salad.png",
        "samosas.png": "images/resources/samosas.png",
        "sand.png": "images/resources/sand.png",
        "satellite.png": "images/resources/satellite.png",
        "sausages.png": "images/resources/sausages.png",
        "seeds.png": "images/resources/seeds.png",
        "silicon.png": "images/resources/silicon.png",
        "simmi-shoes.png": "images/resources/simmi-shoes.png",
        "single-engine.png": "images/resources/single-engine.png",
        "smart-phones.png": "images/resources/smart-phones.png",
        "sneakers.png": "images/resources/sneakers.png",
        "software.png": "images/resources/software.png",
        "solid-rocket.png": "images/resources/solid-rocket.png",
        "starship.png": "images/resources/starship.png",
        "steak.png": "images/resources/steak.png",
        "steel-beams.png": "images/resources/steel-beams.png",
        "steel.png": "images/resources/steel.png",
        "sub-orbital-rocket.png": "images/resources/sub-orbital-rocket.png",
        "sub-orbital-rocket2.png": "images/resources/sub-orbital-rocket2.png",
        "sub-orbital-second-stage.png": "images/resources/sub-orbital-second-stage.png",
        "sugar.png": "images/resources/sugar.png",
        "sugarcane.png": "images/resources/sugarcane.png",
        "super-heavy-booster.png": "images/resources/super-heavy-booster.png",
        "tablets.png": "images/resources/tablets.png",
        "televisions.png": "images/resources/televisions.png",
        "tools.png": "images/resources/tools.png",
        "transport.png": "images/resources/transport.png",
        "tree.png": "images/resources/tree.png",
        "truck.png": "images/resources/truck.png",
        "underwear.png": "images/resources/underwear.png",
        "vegetable-oil.png": "images/resources/vegetable-oil.png",
        "vegetables.png": "images/resources/vegetables.png",
        "water.png": "images/resources/water.png",
        "windows.png": "images/resources/windows.png",
        "wing.png": "images/resources/wing.png",
        "witch-costume.png": "images/resources/witch-costume.png",
        "wood.png": "images/resources/wood.png",
        "xmas-crackers.png": "images/resources/xmas-crackers.png",
        "xmas-ornament.png": "images/resources/xmas-ornament.png",

        "exchange_tier01.png": "images/buildings/other/exchange_tier01.png",
        "exchange_tier02.png": "images/buildings/other/exchange_tier02.png",
        "exchange_tier03.png": "images/buildings/other/exchange_tier03.png",
        "exchange_tier04.png": "images/buildings/other/exchange_tier04.png",
        "exchange_tier05.png": "images/buildings/other/exchange_tier05.png",
        "exchange_tier06.png": "images/buildings/other/exchange_tier06.png",
        "exchange_tier07.png": "images/buildings/other/exchange_tier07.png",
        "exchange_tier08.png": "images/buildings/other/exchange_tier08.png",
        "exchange_tier09.png": "images/buildings/other/exchange_tier09.png",
        "exchange_tier10.png": "images/buildings/other/exchange_tier10.png",
        "exchange_tier11.png": "images/buildings/other/exchange_tier11.png",
        "exchange_tier12.png": "images/buildings/other/exchange_tier12.png",
        "exchange_tier13.png": "images/buildings/other/exchange_tier13.png",
        "exchange_tier14.png": "images/buildings/other/exchange_tier14.png",
        "exchange_tier15.png": "images/buildings/other/exchange_tier15.png",
        "exchange_tier16.png": "images/buildings/other/exchange_tier16.png",
        "exchange_tier17.png": "images/buildings/other/exchange_tier17.png",
        "exchange_tier18.png": "images/buildings/other/exchange_tier18.png",

        "residential_02.png": "images/buildings/decoration/residential_02.png",
        "forrest_02.png": "images/buildings/decoration/forrest_02.png",
        "forrest_03.png": "images/buildings/decoration/forrest_03.png",
        "residential_01.png": "images/buildings/decoration/residential_01.png",
        "park_01.png": "images/buildings/decoration/park_01.png",
        "construction_slot_01.png": "images/buildings/decoration/construction_slot_01.png",
        "construction_slot_02.png": "images/buildings/decoration/construction_slot_02.png",
        "forrest_04.png": "images/buildings/decoration/forrest_04.png",
        "town_square_01.png": "images/buildings/decoration/town_square_01.png",


    };

    /**
     * 三级菜单结构与图片定义 (来自 oldBuildingsGraphic1)
     */
    const DEFAULT_UI_MANIFEST = {
        "建筑外观": {
            "生产建筑": {
                "机库": {
                    "hangar_tier01.png": { name: "新1级机库", presets: [{ name: "旧1级机库", url: "https://scimg.22-7.top/images/landscape/horizontal-integration-lvl1.png" }, { name: "旧2级机库", url: "https://scimg.22-7.top/images/landscape/horizontal-integration-lvl2.png" }, { name: "旧3级机库", url: "https://scimg.22-7.top/images/landscape/horizontal-integration-lvl3.png" }] },
                    "hangar_tier02.png": { name: "新2级机库", presets: [{ name: "旧1级机库", url: "https://scimg.22-7.top/images/landscape/horizontal-integration-lvl1.png" }, { name: "旧2级机库", url: "https://scimg.22-7.top/images/landscape/horizontal-integration-lvl2.png" }, { name: "旧3级机库", url: "https://scimg.22-7.top/images/landscape/horizontal-integration-lvl3.png" }] },
                    "hangar_tier03.png": { name: "新3级机库", presets: [{ name: "旧1级机库", url: "https://scimg.22-7.top/images/landscape/horizontal-integration-lvl1.png" }, { name: "旧2级机库", url: "https://scimg.22-7.top/images/landscape/horizontal-integration-lvl2.png" }, { name: "旧3级机库", url: "https://scimg.22-7.top/images/landscape/horizontal-integration-lvl3.png" }] },
                    "hangar_tier04.png": { name: "新6级机库", presets: [{ name: "旧1级机库", url: "https://scimg.22-7.top/images/landscape/horizontal-integration-lvl1.png" }, { name: "旧2级机库", url: "https://scimg.22-7.top/images/landscape/horizontal-integration-lvl2.png" }, { name: "旧3级机库", url: "https://scimg.22-7.top/images/landscape/horizontal-integration-lvl3.png" }] },
                    "hangar_tier05.png": { name: "新10级机库", presets: [{ name: "旧1级机库", url: "https://scimg.22-7.top/images/landscape/horizontal-integration-lvl1.png" }, { name: "旧2级机库", url: "https://scimg.22-7.top/images/landscape/horizontal-integration-lvl2.png" }, { name: "旧3级机库", url: "https://scimg.22-7.top/images/landscape/horizontal-integration-lvl3.png" }] },
                    "hangar_tier06.png": { name: "新15级机库", presets: [{ name: "旧1级机库", url: "https://scimg.22-7.top/images/landscape/horizontal-integration-lvl1.png" }, { name: "旧2级机库", url: "https://scimg.22-7.top/images/landscape/horizontal-integration-lvl2.png" }, { name: "旧3级机库", url: "https://scimg.22-7.top/images/landscape/horizontal-integration-lvl3.png" }] }
                },
                "汽车厂": {
                    "carfactory-lvl1.png": { name: "1级汽车厂", presets: [{ name: "旧1级汽车厂", url: "https://scimg.22-7.top/images/landscape/carfactory-lvl1.png" }, { name: "旧2级汽车厂", url: "https://scimg.22-7.top/images/landscape/carfactory-lvl2.png" }] },
                    "carfactory-lvl2.png": { name: "2级汽车厂", presets: [{ name: "旧1级汽车厂", url: "https://scimg.22-7.top/images/landscape/carfactory-lvl1.png" }, { name: "旧2级汽车厂", url: "https://scimg.22-7.top/images/landscape/carfactory-lvl2.png" }] }
                },
                "饮料工厂": {
                    "beverage_factory_tier01.png": { name: "新1级饮料工厂", presets: [{ name: "旧1级饮料工厂", url: "https://scimg.22-7.top/images/landscape/beverage-factory-lvl1.png" }, { name: "旧2级饮料工厂", url: "https://scimg.22-7.top/images/landscape/beverage-factory-lvl2.png" }, { name: "旧3级饮料工厂", url: "https://scimg.22-7.top/images/landscape/beverage-factory-lvl3.png" }] },
                    "beverage_factory_tier02.png": { name: "新2级饮料工厂", presets: [{ name: "旧1级饮料工厂", url: "https://scimg.22-7.top/images/landscape/beverage-factory-lvl1.png" }, { name: "旧2级饮料工厂", url: "https://scimg.22-7.top/images/landscape/beverage-factory-lvl2.png" }, { name: "旧3级饮料工厂", url: "https://scimg.22-7.top/images/landscape/beverage-factory-lvl3.png" }] },
                    "beverage_factory_tier03.png": { name: "新3级饮料工厂", presets: [{ name: "旧1级饮料工厂", url: "https://scimg.22-7.top/images/landscape/beverage-factory-lvl1.png" }, { name: "旧2级饮料工厂", url: "https://scimg.22-7.top/images/landscape/beverage-factory-lvl2.png" }, { name: "旧3级饮料工厂", url: "https://scimg.22-7.top/images/landscape/beverage-factory-lvl3.png" }] },
                    "beverage_factory_tier04.png": { name: "新6级饮料工厂", presets: [{ name: "旧1级饮料工厂", url: "https://scimg.22-7.top/images/landscape/beverage-factory-lvl1.png" }, { name: "旧2级饮料工厂", url: "https://scimg.22-7.top/images/landscape/beverage-factory-lvl2.png" }, { name: "旧3级饮料工厂", url: "https://scimg.22-7.top/images/landscape/beverage-factory-lvl3.png" }] }
                },
                "航空航天厂": {
                    "aerospace_factory_tier01.png": { name: "新1级航空航天厂", presets: [{ name: "旧1级航空航天厂", url: "https://scimg.22-7.top/images/landscape/aerospace-2-lvl1.png" }, { name: "旧2级航空航天厂", url: "https://scimg.22-7.top/images/landscape/aerospace-2-lvl2.png" }, { name: "旧3级航空航天厂", url: "https://scimg.22-7.top/images/landscape/aerospace-2-lvl3.png" }] },
                    "aerospace_factory_tier02.png": { name: "新2级航空航天厂", presets: [{ name: "旧1级航空航天厂", url: "https://scimg.22-7.top/images/landscape/aerospace-2-lvl1.png" }, { name: "旧2级航空航天厂", url: "https://scimg.22-7.top/images/landscape/aerospace-2-lvl2.png" }, { name: "旧3级航空航天厂", url: "https://scimg.22-7.top/images/landscape/aerospace-2-lvl3.png" }] },
                    "aerospace_factory_tier03.png": { name: "新3级航空航天厂", presets: [{ name: "旧1级航空航天厂", url: "https://scimg.22-7.top/images/landscape/aerospace-2-lvl1.png" }, { name: "旧2级航空航天厂", url: "https://scimg.22-7.top/images/landscape/aerospace-2-lvl2.png" }, { name: "旧3级航空航天厂", url: "https://scimg.22-7.top/images/landscape/aerospace-2-lvl3.png" }] },
                    "aerospace_factory_tier04.png": { name: "新6级航空航天厂", presets: [{ name: "旧1级航空航天厂", url: "https://scimg.22-7.top/images/landscape/aerospace-2-lvl1.png" }, { name: "旧2级航空航天厂", url: "https://scimg.22-7.top/images/landscape/aerospace-2-lvl2.png" }, { name: "旧3级航空航天厂", url: "https://scimg.22-7.top/images/landscape/aerospace-2-lvl3.png" }] },
                    "aerospace_factory_tier05.png": { name: "新10级航空航天厂", presets: [{ name: "旧1级航空航天厂", url: "https://scimg.22-7.top/images/landscape/aerospace-2-lvl1.png" }, { name: "旧2级航空航天厂", url: "https://scimg.22-7.top/images/landscape/aerospace-2-lvl2.png" }, { name: "旧3级航空航天厂", url: "https://scimg.22-7.top/images/landscape/aerospace-2-lvl3.png" }] },
                    "aerospace_factory_tier06.png": { name: "新15级航空航天厂", presets: [{ name: "旧1级航空航天厂", url: "https://scimg.22-7.top/images/landscape/aerospace-2-lvl1.png" }, { name: "旧2级航空航天厂", url: "https://scimg.22-7.top/images/landscape/aerospace-2-lvl2.png" }, { name: "旧3级航空航天厂", url: "https://scimg.22-7.top/images/landscape/aerospace-2-lvl3.png" }] }
                },
                "航空电子器件厂": {
                    "aerospace_electronics_tier01.png": { name: "新1级航空电子器件厂", presets: [{ name: "旧1级航空电子器件厂", url: "https://scimg.22-7.top/images/landscape/aero-electronics-2-lvl1.png" }, { name: "旧2级航空电子器件厂", url: "https://scimg.22-7.top/images/landscape/aero-electronics-2-lvl2.png" }, { name: "旧3级航空电子器件厂", url: "https://scimg.22-7.top/images/landscape/aero-electronics-2-lvl3.png" }] },
                    "aerospace_electronics_tier02.png": { name: "新2级航空电子器件厂", presets: [{ name: "旧1级航空电子器件厂", url: "https://scimg.22-7.top/images/landscape/aero-electronics-2-lvl1.png" }, { name: "旧2级航空电子器件厂", url: "https://scimg.22-7.top/images/landscape/aero-electronics-2-lvl2.png" }, { name: "旧3级航空电子器件厂", url: "https://scimg.22-7.top/images/landscape/aero-electronics-2-lvl3.png" }] },
                    "aerospace_electronics_tier03.png": { name: "新3级航空电子器件厂", presets: [{ name: "旧1级航空电子器件厂", url: "https://scimg.22-7.top/images/landscape/aero-electronics-2-lvl1.png" }, { name: "旧2级航空电子器件厂", url: "https://scimg.22-7.top/images/landscape/aero-electronics-2-lvl2.png" }, { name: "旧3级航空电子器件厂", url: "https://scimg.22-7.top/images/landscape/aero-electronics-2-lvl3.png" }] },
                    "aerospace_electronics_tier04.png": { name: "新6级航空电子器件厂", presets: [{ name: "旧1级航空电子器件厂", url: "https://scimg.22-7.top/images/landscape/aero-electronics-2-lvl1.png" }, { name: "旧2级航空电子器件厂", url: "https://scimg.22-7.top/images/landscape/aero-electronics-2-lvl2.png" }, { name: "旧3级航空电子器件厂", url: "https://scimg.22-7.top/images/landscape/aero-electronics-2-lvl3.png" }] },
                    "aerospace_electronics_tier05.png": { name: "新10级航空电子器件厂", presets: [{ name: "旧1级航空电子器件厂", url: "https://scimg.22-7.top/images/landscape/aero-electronics-2-lvl1.png" }, { name: "旧2级航空电子器件厂", url: "https://scimg.22-7.top/images/landscape/aero-electronics-2-lvl2.png" }, { name: "旧3级航空电子器件厂", url: "https://scimg.22-7.top/images/landscape/aero-electronics-2-lvl3.png" }] },
                    "aerospace_electronics_tier06.png": { name: "新15级航空电子器件厂", presets: [{ name: "旧1级航空电子器件厂", url: "https://scimg.22-7.top/images/landscape/aero-electronics-2-lvl1.png" }, { name: "旧2级航空电子器件厂", url: "https://scimg.22-7.top/images/landscape/aero-electronics-2-lvl2.png" }, { name: "旧3级航空电子器件厂", url: "https://scimg.22-7.top/images/landscape/aero-electronics-2-lvl3.png" }] }
                },
                "垂直整合设施": {
                    "vertical_integration_facility_tier01.png": { name: "新1级垂直整合设施", presets: [{ name: "旧1级垂直整合设施", url: "https://scimg.22-7.top/images/landscape/vertical-integration-lvl1.png" }, { name: "旧2级垂直整合设施", url: "https://scimg.22-7.top/images/landscape/vertical-integration-lvl2.png" }, { name: "旧3级垂直整合设施", url: "https://scimg.22-7.top/images/landscape/vertical-integration-lvl3.png" }] },
                    "vertical_integration_facility_tier02.png": { name: "新2级垂直整合设施", presets: [{ name: "旧1级垂直整合设施", url: "https://scimg.22-7.top/images/landscape/vertical-integration-lvl1.png" }, { name: "旧2级垂直整合设施", url: "https://scimg.22-7.top/images/landscape/vertical-integration-lvl2.png" }, { name: "旧3级垂直整合设施", url: "https://scimg.22-7.top/images/landscape/vertical-integration-lvl3.png" }] },
                    "vertical_integration_facility_tier03.png": { name: "新3级垂直整合设施", presets: [{ name: "旧1级垂直整合设施", url: "https://scimg.22-7.top/images/landscape/vertical-integration-lvl1.png" }, { name: "旧2级垂直整合设施", url: "https://scimg.22-7.top/images/landscape/vertical-integration-lvl2.png" }, { name: "旧3级垂直整合设施", url: "https://scimg.22-7.top/images/landscape/vertical-integration-lvl3.png" }] },
                    "vertical_integration_facility_tier04.png": { name: "新6级垂直整合设施", presets: [{ name: "旧1级垂直整合设施", url: "https://scimg.22-7.top/images/landscape/vertical-integration-lvl1.png" }, { name: "旧2级垂直整合设施", url: "https://scimg.22-7.top/images/landscape/vertical-integration-lvl2.png" }, { name: "旧3级垂直整合设施", url: "https://scimg.22-7.top/images/landscape/vertical-integration-lvl3.png" }] },
                    "vertical_integration_facility_tier05.png": { name: "新10级垂直整合设施", presets: [{ name: "旧1级垂直整合设施", url: "https://scimg.22-7.top/images/landscape/vertical-integration-lvl1.png" }, { name: "旧2级垂直整合设施", url: "https://scimg.22-7.top/images/landscape/vertical-integration-lvl2.png" }, { name: "旧3级垂直整合设施", url: "https://scimg.22-7.top/images/landscape/vertical-integration-lvl3.png" }] },
                    "vertical_integration_facility_tier06.png": { name: "新15级垂直整合设施", presets: [{ name: "旧1级垂直整合设施", url: "https://scimg.22-7.top/images/landscape/vertical-integration-lvl1.png" }, { name: "旧2级垂直整合设施", url: "https://scimg.22-7.top/images/landscape/vertical-integration-lvl2.png" }, { name: "旧3级垂直整合设施", url: "https://scimg.22-7.top/images/landscape/vertical-integration-lvl3.png" }] }
                },
                "农场": {
                    "farm_tier01.png": { name: "新1级农场", presets: [{ name: "旧1级农场", url: "https://scimg.22-7.top/images/landscape/plantation-lvl1.png" }, { name: "旧2级农场", url: "https://scimg.22-7.top/images/landscape/plantation-lvl2.png" }, { name: "旧3级农场", url: "https://scimg.22-7.top/images/landscape/plantation-lvl3.png" }] },
                    "farm_tier02.png": { name: "新2级农场", presets: [{ name: "旧1级农场", url: "https://scimg.22-7.top/images/landscape/plantation-lvl1.png" }, { name: "旧2级农场", url: "https://scimg.22-7.top/images/landscape/plantation-lvl2.png" }, { name: "旧3级农场", url: "https://scimg.22-7.top/images/landscape/plantation-lvl3.png" }] },
                    "farm_tier03.png": { name: "新3级农场", presets: [{ name: "旧1级农场", url: "https://scimg.22-7.top/images/landscape/plantation-lvl1.png" }, { name: "旧2级农场", url: "https://scimg.22-7.top/images/landscape/plantation-lvl2.png" }, { name: "旧3级农场", url: "https://scimg.22-7.top/images/landscape/plantation-lvl3.png" }] },
                    "farm_tier04.png": { name: "新6级农场", presets: [{ name: "旧1级农场", url: "https://scimg.22-7.top/images/landscape/plantation-lvl1.png" }, { name: "旧2级农场", url: "https://scimg.22-7.top/images/landscape/plantation-lvl2.png" }, { name: "旧3级农场", url: "https://scimg.22-7.top/images/landscape/plantation-lvl3.png" }] }
                },
                "水库": {
                    "water_reservoir_tier01.png": { name: "新1级水库", presets: [{ name: "旧1级水库", url: "https://scimg.22-7.top/images/landscape/reservoir-lvl1.png" }, { name: "旧2级水库", url: "https://scimg.22-7.top/images/landscape/reservoir-lvl2.png" }] },
                    "water_reservoir_tier02.png": { name: "新2级水库", presets: [{ name: "旧1级水库", url: "https://scimg.22-7.top/images/landscape/reservoir-lvl1.png" }, { name: "旧2级水库", url: "https://scimg.22-7.top/images/landscape/reservoir-lvl2.png" }] },
                    "water_reservoir_tier03.png": { name: "新3级水库", presets: [{ name: "旧1级水库", url: "https://scimg.22-7.top/images/landscape/reservoir-lvl1.png" }, { name: "旧2级水库", url: "https://scimg.22-7.top/images/landscape/reservoir-lvl2.png" }] },
                    "water_reservoir_tier04.png": { name: "新6级水库", presets: [{ name: "旧1级水库", url: "https://scimg.22-7.top/images/landscape/reservoir-lvl1.png" }, { name: "旧2级水库", url: "https://scimg.22-7.top/images/landscape/reservoir-lvl2.png" }] },
                    "water_reservoir_tier05.png": { name: "新10级水库", presets: [{ name: "旧1级水库", url: "https://scimg.22-7.top/images/landscape/reservoir-lvl1.png" }, { name: "旧2级水库", url: "https://scimg.22-7.top/images/landscape/reservoir-lvl2.png" }] },
                    "water_reservoir_tier06.png": { name: "新15级水库", presets: [{ name: "旧1级水库", url: "https://scimg.22-7.top/images/landscape/reservoir-lvl1.png" }, { name: "旧2级水库", url: "https://scimg.22-7.top/images/landscape/reservoir-lvl2.png" }] }
                },
                "发电厂": {
                    "power_plant_tier01.png": { name: "新1级发电厂", presets: [{ name: "旧1级发电厂", url: "https://scimg.22-7.top/images/landscape/powerplant-lvl1.png" }, { name: "旧2级发电厂", url: "https://scimg.22-7.top/images/landscape/powerplant-lvl2.png" }] },
                    "power_plant_tier02.png": { name: "新2级发电厂", presets: [{ name: "旧1级发电厂", url: "https://scimg.22-7.top/images/landscape/powerplant-lvl1.png" }, { name: "旧2级发电厂", url: "https://scimg.22-7.top/images/landscape/powerplant-lvl2.png" }] },
                    "power_plant_tier03.png": { name: "新3级发电厂", presets: [{ name: "旧1级发电厂", url: "https://scimg.22-7.top/images/landscape/powerplant-lvl1.png" }, { name: "旧2级发电厂", url: "https://scimg.22-7.top/images/landscape/powerplant-lvl2.png" }] },
                    "power_plant_tier04.png": { name: "新6级发电厂", presets: [{ name: "旧1级发电厂", url: "https://scimg.22-7.top/images/landscape/powerplant-lvl1.png" }, { name: "旧2级发电厂", url: "https://scimg.22-7.top/images/landscape/powerplant-lvl2.png" }] },
                    "power_plant_tier05.png": { name: "新10级发电厂", presets: [{ name: "旧1级发电厂", url: "https://scimg.22-7.top/images/landscape/powerplant-lvl1.png" }, { name: "旧2级发电厂", url: "https://scimg.22-7.top/images/landscape/powerplant-lvl2.png" }] },
                    "power_plant_tier06.png": { name: "新15级发电厂", presets: [{ name: "旧1级发电厂", url: "https://scimg.22-7.top/images/landscape/powerplant-lvl1.png" }, { name: "旧2级发电厂", url: "https://scimg.22-7.top/images/landscape/powerplant-lvl2.png" }] }
                },
                "油井": {
                    "oil_rig_tier01.png": { name: "新1级油井", presets: [{ name: "旧1级油井", url: "https://scimg.22-7.top/images/landscape/oilrig-lvl1.png" }, { name: "旧2级油井", url: "https://scimg.22-7.top/images/landscape/oilrig-lvl2.png" }] },
                    "oil_rig_tier02.png": { name: "新2级油井", presets: [{ name: "旧1级油井", url: "https://scimg.22-7.top/images/landscape/oilrig-lvl1.png" }, { name: "旧2级油井", url: "https://scimg.22-7.top/images/landscape/oilrig-lvl2.png" }] },
                    "oil_rig_tier03.png": { name: "新3级油井", presets: [{ name: "旧1级油井", url: "https://scimg.22-7.top/images/landscape/oilrig-lvl1.png" }, { name: "旧2级油井", url: "https://scimg.22-7.top/images/landscape/oilrig-lvl2.png" }] },
                    "oil_rig_tier04.png": { name: "新6级油井", presets: [{ name: "旧1级油井", url: "https://scimg.22-7.top/images/landscape/oilrig-lvl1.png" }, { name: "旧2级油井", url: "https://scimg.22-7.top/images/landscape/oilrig-lvl2.png" }] },
                    "oil_rig_tier05.png": { name: "新10级油井", presets: [{ name: "旧1级油井", url: "https://scimg.22-7.top/images/landscape/oilrig-lvl1.png" }, { name: "旧2级油井", url: "https://scimg.22-7.top/images/landscape/oilrig-lvl2.png" }] },
                    "oil_rig_tier06.png": { name: "新15级油井", presets: [{ name: "旧1级油井", url: "https://scimg.22-7.top/images/landscape/oilrig-lvl1.png" }, { name: "旧2级油井", url: "https://scimg.22-7.top/images/landscape/oilrig-lvl2.png" }] }
                },
                "炼油厂": {
                    "refinery_tier01.png": { name: "新1级炼油厂", presets: [{ name: "旧1级炼油厂", url: "https://scimg.22-7.top/images/landscape/refinery-lvl1.png" }, { name: "旧2级炼油厂", url: "https://scimg.22-7.top/images/landscape/refinery-lvl2.png" }] },
                    "refinery_tier02.png": { name: "新2级炼油厂", presets: [{ name: "旧1级炼油厂", url: "https://scimg.22-7.top/images/landscape/refinery-lvl1.png" }, { name: "旧2级炼油厂", url: "https://scimg.22-7.top/images/landscape/refinery-lvl2.png" }] },
                    "refinery_tier03.png": { name: "新3级炼油厂", presets: [{ name: "旧1级炼油厂", url: "https://scimg.22-7.top/images/landscape/refinery-lvl1.png" }, { name: "旧2级炼油厂", url: "https://scimg.22-7.top/images/landscape/refinery-lvl2.png" }] },
                    "refinery_tier04.png": { name: "新6级炼油厂", presets: [{ name: "旧1级炼油厂", url: "https://scimg.22-7.top/images/landscape/refinery-lvl1.png" }, { name: "旧2级炼油厂", url: "https://scimg.22-7.top/images/landscape/refinery-lvl2.png" }] }
                },
                "货运站": {
                    "shipping_depot_tier01.png": { name: "新1级货运站", presets: [{ name: "旧1级货运站", url: "https://scimg.22-7.top/images/landscape/shipping-lvl1.png" }, { name: "旧2级货运站", url: "https://scimg.22-7.top/images/landscape/shipping-lvl2.png" }] },
                    "shipping_depot_tier02.png": { name: "新2级货运站", presets: [{ name: "旧1级货运站", url: "https://scimg.22-7.top/images/landscape/shipping-lvl1.png" }, { name: "旧2级货运站", url: "https://scimg.22-7.top/images/landscape/shipping-lvl2.png" }] },
                    "shipping_depot_tier03.png": { name: "新3级货运站", presets: [{ name: "旧1级货运站", url: "https://scimg.22-7.top/images/landscape/shipping-lvl1.png" }, { name: "旧2级货运站", url: "https://scimg.22-7.top/images/landscape/shipping-lvl2.png" }] },
                    "shipping_depot_tier04.png": { name: "新6级货运站", presets: [{ name: "旧1级货运站", url: "https://scimg.22-7.top/images/landscape/shipping-lvl1.png" }, { name: "旧2级货运站", url: "https://scimg.22-7.top/images/landscape/shipping-lvl2.png" }] }
                },
                "牧场": {
                    "ranch_tier01.png": { name: "新1级牧场", presets: [{ name: "旧1级牧场", url: "https://scimg.22-7.top/images/landscape/farm-lvl1.png" }, { name: "旧2级牧场", url: "https://scimg.22-7.top/images/landscape/farm-lvl2.png" }] },
                    "ranch_tier02.png": { name: "新2级牧场", presets: [{ name: "旧1级牧场", url: "https://scimg.22-7.top/images/landscape/farm-lvl1.png" }, { name: "旧2级牧场", url: "https://scimg.22-7.top/images/landscape/farm-lvl2.png" }] },
                    "ranch_tier03.png": { name: "新3级牧场", presets: [{ name: "旧1级牧场", url: "https://scimg.22-7.top/images/landscape/farm-lvl1.png" }, { name: "旧2级牧场", url: "https://scimg.22-7.top/images/landscape/farm-lvl2.png" }] },
                    "ranch_tier04.png": { name: "新6级牧场", presets: [{ name: "旧1级牧场", url: "https://scimg.22-7.top/images/landscape/farm-lvl1.png" }, { name: "旧2级牧场", url: "https://scimg.22-7.top/images/landscape/farm-lvl2.png" }] }
                },
                "矿井": {
                    "mine_tier01.png": { name: "新1级矿井", presets: [{ name: "旧1级矿井", url: "https://scimg.22-7.top/images/landscape/mine-lvl1.png" }, { name: "旧2级矿井", url: "https://scimg.22-7.top/images/landscape/mine-lvl2.png" }] },
                    "mine_tier02.png": { name: "新2级矿井", presets: [{ name: "旧1级矿井", url: "https://scimg.22-7.top/images/landscape/mine-lvl1.png" }, { name: "旧2级矿井", url: "https://scimg.22-7.top/images/landscape/mine-lvl2.png" }] },
                    "mine_tier03.png": { name: "新3级矿井", presets: [{ name: "旧1级矿井", url: "https://scimg.22-7.top/images/landscape/mine-lvl1.png" }, { name: "旧2级矿井", url: "https://scimg.22-7.top/images/landscape/mine-lvl2.png" }] },
                    "mine_tier04.png": { name: "新6级矿井", presets: [{ name: "旧1级矿井", url: "https://scimg.22-7.top/images/landscape/mine-lvl1.png" }, { name: "旧2级矿井", url: "https://scimg.22-7.top/images/landscape/mine-lvl2.png" }] },
                    "mine_tier05.png": { name: "新10级矿井", presets: [{ name: "旧1级矿井", url: "https://scimg.22-7.top/images/landscape/mine-lvl1.png" }, { name: "旧2级矿井", url: "https://scimg.22-7.top/images/landscape/mine-lvl2.png" }] },
                    "mine_tier06.png": { name: "新15级矿井", presets: [{ name: "旧1级矿井", url: "https://scimg.22-7.top/images/landscape/mine-lvl1.png" }, { name: "旧2级矿井", url: "https://scimg.22-7.top/images/landscape/mine-lvl2.png" }] }
                },
                "材料加工厂": {
                    "factory_tier01.png": { name: "新1级材料加工厂", presets: [{ name: "旧1级材料加工厂", url: "https://scimg.22-7.top/images/landscape/factory-lvl1.png" }, { name: "旧2级材料加工厂", url: "https://scimg.22-7.top/images/landscape/factory-lvl2.png" }] },
                    "factory_tier02.png": { name: "新2级材料加工厂", presets: [{ name: "旧1级材料加工厂", url: "https://scimg.22-7.top/images/landscape/factory-lvl1.png" }, { name: "旧2级材料加工厂", url: "https://scimg.22-7.top/images/landscape/factory-lvl2.png" }] },
                    "factory_tier03.png": { name: "新3级材料加工厂", presets: [{ name: "旧1级材料加工厂", url: "https://scimg.22-7.top/images/landscape/factory-lvl1.png" }, { name: "旧2级材料加工厂", url: "https://scimg.22-7.top/images/landscape/factory-lvl2.png" }] },
                    "factory_tier04.png": { name: "新6级材料加工厂", presets: [{ name: "旧1级材料加工厂", url: "https://scimg.22-7.top/images/landscape/factory-lvl1.png" }, { name: "旧2级材料加工厂", url: "https://scimg.22-7.top/images/landscape/factory-lvl2.png" }] },
                    "factory_tier05.png": { name: "新10级材料加工厂", presets: [{ name: "旧1级材料加工厂", url: "https://scimg.22-7.top/images/landscape/factory-lvl1.png" }, { name: "旧2级材料加工厂", url: "https://scimg.22-7.top/images/landscape/factory-lvl2.png" }] },
                    "factory_tier06.png": { name: "新15级材料加工厂", presets: [{ name: "旧1级材料加工厂", url: "https://scimg.22-7.top/images/landscape/factory-lvl1.png" }, { name: "旧2级材料加工厂", url: "https://scimg.22-7.top/images/landscape/factory-lvl2.png" }] }
                },
                "电子产品厂": {
                    "electronics_factory_tier01.png": { name: "新1级电子产品厂", presets: [{ name: "旧1级电子产品厂", url: "https://scimg.22-7.top/images/landscape/efactory4-lvl1.png" }, { name: "旧2级电子产品厂", url: "https://scimg.22-7.top/images/landscape/efactory4-lvl2.png" }, { name: "旧3级电子产品厂", url: "https://scimg.22-7.top/images/landscape/efactory4-lvl3.png" }] },
                    "electronics_factory_tier02.png": { name: "新2级电子产品厂", presets: [{ name: "旧1级电子产品厂", url: "https://scimg.22-7.top/images/landscape/efactory4-lvl1.png" }, { name: "旧2级电子产品厂", url: "https://scimg.22-7.top/images/landscape/efactory4-lvl2.png" }, { name: "旧3级电子产品厂", url: "https://scimg.22-7.top/images/landscape/efactory4-lvl3.png" }] },
                    "electronics_factory_tier03.png": { name: "新3级电子产品厂", presets: [{ name: "旧1级电子产品厂", url: "https://scimg.22-7.top/images/landscape/efactory4-lvl1.png" }, { name: "旧2级电子产品厂", url: "https://scimg.22-7.top/images/landscape/efactory4-lvl2.png" }, { name: "旧3级电子产品厂", url: "https://scimg.22-7.top/images/landscape/efactory4-lvl3.png" }] },
                    "electronics_factory_tier04.png": { name: "新6级电子产品厂", presets: [{ name: "旧1级电子产品厂", url: "https://scimg.22-7.top/images/landscape/efactory4-lvl1.png" }, { name: "旧2级电子产品厂", url: "https://scimg.22-7.top/images/landscape/efactory4-lvl2.png" }, { name: "旧3级电子产品厂", url: "https://scimg.22-7.top/images/landscape/efactory4-lvl3.png" }] },
                    "electronics_factory_tier05.png": { name: "新10级电子产品厂", presets: [{ name: "旧1级电子产品厂", url: "https://scimg.22-7.top/images/landscape/efactory4-lvl1.png" }, { name: "旧2级电子产品厂", url: "https://scimg.22-7.top/images/landscape/efactory4-lvl2.png" }, { name: "旧3级电子产品厂", url: "https://scimg.22-7.top/images/landscape/efactory4-lvl3.png" }] },
                    "electronics_factory_tier06.png": { name: "新15级电子产品厂", presets: [{ name: "旧1级电子产品厂", url: "https://scimg.22-7.top/images/landscape/efactory4-lvl1.png" }, { name: "旧2级电子产品厂", url: "https://scimg.22-7.top/images/landscape/efactory4-lvl2.png" }, { name: "旧3级电子产品厂", url: "https://scimg.22-7.top/images/landscape/efactory4-lvl3.png" }] }
                },
                "时装厂": {
                    "clothsfactory-lvl1.png": { name: "1级时装厂", presets: [{ name: "旧1级时装厂", url: "https://scimg.22-7.top/images/landscape/clothsfactory-lvl1.png" }, { name: "旧2级时装厂", url: "https://scimg.22-7.top/images/landscape/clothsfactory-lvl2.png" }] },
                    "clothsfactory-lvl2.png": { name: "2级时装厂", presets: [{ name: "旧1级时装厂", url: "https://scimg.22-7.top/images/landscape/clothsfactory-lvl1.png" }, { name: "旧2级时装厂", url: "https://scimg.22-7.top/images/landscape/clothsfactory-lvl2.png" }] }
                },
                "推进器工厂": {
                    "propulsion_factory_tier01.png": { name: "新1级推进器工厂", presets: [{ name: "旧1级推进器工厂", url: "https://scimg.22-7.top/images/landscape/propulsion-2-lvl1.png" }, { name: "旧2级推进器工厂", url: "https://scimg.22-7.top/images/landscape/propulsion-2-lvl2.png" }, { name: "旧3级推进器工厂", url: "https://scimg.22-7.top/images/landscape/propulsion-2-lvl3.png" }] },
                    "propulsion_factory_tier02.png": { name: "新2级推进器工厂", presets: [{ name: "旧1级推进器工厂", url: "https://scimg.22-7.top/images/landscape/propulsion-2-lvl1.png" }, { name: "旧2级推进器工厂", url: "https://scimg.22-7.top/images/landscape/propulsion-2-lvl2.png" }, { name: "旧3级推进器工厂", url: "https://scimg.22-7.top/images/landscape/propulsion-2-lvl3.png" }] },
                    "propulsion_factory_tier03.png": { name: "新3级推进器工厂", presets: [{ name: "旧1级推进器工厂", url: "https://scimg.22-7.top/images/landscape/propulsion-2-lvl1.png" }, { name: "旧2级推进器工厂", url: "https://scimg.22-7.top/images/landscape/propulsion-2-lvl2.png" }, { name: "旧3级推进器工厂", url: "https://scimg.22-7.top/images/landscape/propulsion-2-lvl3.png" }] },
                    "propulsion_factory_tier04.png": { name: "新6级推进器工厂", presets: [{ name: "旧1级推进器工厂", url: "https://scimg.22-7.top/images/landscape/propulsion-2-lvl1.png" }, { name: "旧2级推进器工厂", url: "https://scimg.22-7.top/images/landscape/propulsion-2-lvl2.png" }, { name: "旧3级推进器工厂", url: "https://scimg.22-7.top/images/landscape/propulsion-2-lvl3.png" }] },
                    "propulsion_factory_tier05.png": { name: "新10级推进器工厂", presets: [{ name: "旧1级推进器工厂", url: "https://scimg.22-7.top/images/landscape/propulsion-2-lvl1.png" }, { name: "旧2级推进器工厂", url: "https://scimg.22-7.top/images/landscape/propulsion-2-lvl2.png" }, { name: "旧3级推进器工厂", url: "https://scimg.22-7.top/images/landscape/propulsion-2-lvl3.png" }] },
                    "propulsion_factory_tier06.png": { name: "新15级推进器工厂", presets: [{ name: "旧1级推进器工厂", url: "https://scimg.22-7.top/images/landscape/propulsion-2-lvl1.png" }, { name: "旧2级推进器工厂", url: "https://scimg.22-7.top/images/landscape/propulsion-2-lvl2.png" }, { name: "旧3级推进器工厂", url: "https://scimg.22-7.top/images/landscape/propulsion-2-lvl3.png" }] }
                },
                "采石场": {
                    "quarry_tier01.png": { name: "新1级采石场", presets: [{ name: "旧1级采石场", url: "https://scimg.22-7.top/images/landscape/quarry-lvl1.png" }, { name: "旧2级采石场", url: "https://scimg.22-7.top/images/landscape/quarry-lvl2.png" }, { name: "旧3级采石场", url: "https://scimg.22-7.top/images/landscape/quarry-lvl3.png" }, { name: "旧4级采石场", url: "https://scimg.22-7.top/images/landscape/quarry-lvl4.png" }] },
                    "quarry_tier02.png": { name: "新2级采石场", presets: [{ name: "旧1级采石场", url: "https://scimg.22-7.top/images/landscape/quarry-lvl1.png" }, { name: "旧2级采石场", url: "https://scimg.22-7.top/images/landscape/quarry-lvl2.png" }, { name: "旧3级采石场", url: "https://scimg.22-7.top/images/landscape/quarry-lvl3.png" }, { name: "旧4级采石场", url: "https://scimg.22-7.top/images/landscape/quarry-lvl4.png" }] },
                    "quarry_tier03.png": { name: "新3级采石场", presets: [{ name: "旧1级采石场", url: "https://scimg.22-7.top/images/landscape/quarry-lvl1.png" }, { name: "旧2级采石场", url: "https://scimg.22-7.top/images/landscape/quarry-lvl2.png" }, { name: "旧3级采石场", url: "https://scimg.22-7.top/images/landscape/quarry-lvl3.png" }, { name: "旧4级采石场", url: "https://scimg.22-7.top/images/landscape/quarry-lvl4.png" }] },
                    "quarry_tier04.png": { name: "新6级采石场", presets: [{ name: "旧1级采石场", url: "https://scimg.22-7.top/images/landscape/quarry-lvl1.png" }, { name: "旧2级采石场", url: "https://scimg.22-7.top/images/landscape/quarry-lvl2.png" }, { name: "旧3级采石场", url: "https://scimg.22-7.top/images/landscape/quarry-lvl3.png" }, { name: "旧4级采石场", url: "https://scimg.22-7.top/images/landscape/quarry-lvl4.png" }] },
                    "quarry_tier05.png": { name: "新10级采石场", presets: [{ name: "旧1级采石场", url: "https://scimg.22-7.top/images/landscape/quarry-lvl1.png" }, { name: "旧2级采石场", url: "https://scimg.22-7.top/images/landscape/quarry-lvl2.png" }, { name: "旧3级采石场", url: "https://scimg.22-7.top/images/landscape/quarry-lvl3.png" }, { name: "旧4级采石场", url: "https://scimg.22-7.top/images/landscape/quarry-lvl4.png" }] },
                    "quarry_tier06.png": { name: "新15级采石场", presets: [{ name: "旧1级采石场", url: "https://scimg.22-7.top/images/landscape/quarry-lvl1.png" }, { name: "旧2级采石场", url: "https://scimg.22-7.top/images/landscape/quarry-lvl2.png" }, { name: "旧3级采石场", url: "https://scimg.22-7.top/images/landscape/quarry-lvl3.png" }, { name: "旧4级采石场", url: "https://scimg.22-7.top/images/landscape/quarry-lvl4.png" }] }
                },
                "混凝土厂": {
                    "concrete_plant_tier01.png": { name: "新1级混凝土厂", presets: [{ name: "旧1级混凝土厂", url: "https://scimg.22-7.top/images/landscape/concrete-plant-lvl1.png" }, { name: "旧2级混凝土厂", url: "https://scimg.22-7.top/images/landscape/concrete-plant-lvl2.png" }, { name: "旧3级混凝土厂", url: "https://scimg.22-7.top/images/landscape/concrete-plant-lvl3.png" }] },
                    "concrete_plant_tier02.png": { name: "新2级混凝土厂", presets: [{ name: "旧1级混凝土厂", url: "https://scimg.22-7.top/images/landscape/concrete-plant-lvl1.png" }, { name: "旧2级混凝土厂", url: "https://scimg.22-7.top/images/landscape/concrete-plant-lvl2.png" }, { name: "旧3级混凝土厂", url: "https://scimg.22-7.top/images/landscape/concrete-plant-lvl3.png" }] },
                    "concrete_plant_tier03.png": { name: "新3级混凝土厂", presets: [{ name: "旧1级混凝土厂", url: "https://scimg.22-7.top/images/landscape/concrete-plant-lvl1.png" }, { name: "旧2级混凝土厂", url: "https://scimg.22-7.top/images/landscape/concrete-plant-lvl2.png" }, { name: "旧3级混凝土厂", url: "https://scimg.22-7.top/images/landscape/concrete-plant-lvl3.png" }] },
                    "concrete_plant_tier04.png": { name: "新6级混凝土厂", presets: [{ name: "旧1级混凝土厂", url: "https://scimg.22-7.top/images/landscape/concrete-plant-lvl1.png" }, { name: "旧2级混凝土厂", url: "https://scimg.22-7.top/images/landscape/concrete-plant-lvl2.png" }, { name: "旧3级混凝土厂", url: "https://scimg.22-7.top/images/landscape/concrete-plant-lvl3.png" }] },
                    "concrete_plant_tier05.png": { name: "新10级混凝土厂", presets: [{ name: "旧1级混凝土厂", url: "https://scimg.22-7.top/images/landscape/concrete-plant-lvl1.png" }, { name: "旧2级混凝土厂", url: "https://scimg.22-7.top/images/landscape/concrete-plant-lvl2.png" }, { name: "旧3级混凝土厂", url: "https://scimg.22-7.top/images/landscape/concrete-plant-lvl3.png" }] },
                    "concrete_plant_tier06.png": { name: "新15级混凝土厂", presets: [{ name: "旧1级混凝土厂", url: "https://scimg.22-7.top/images/landscape/concrete-plant-lvl1.png" }, { name: "旧2级混凝土厂", url: "https://scimg.22-7.top/images/landscape/concrete-plant-lvl2.png" }, { name: "旧3级混凝土厂", url: "https://scimg.22-7.top/images/landscape/concrete-plant-lvl3.png" }] }
                },
                "建材厂": {
                    "construction_factory_tier01.png": { name: "新1级建材厂", presets: [{ name: "旧1级建材厂", url: "https://scimg.22-7.top/images/landscape/construction-factory-lvl1.png" }, { name: "旧2级建材厂", url: "https://scimg.22-7.top/images/landscape/construction-factory-lvl2.png" }, { name: "旧3级建材厂", url: "https://scimg.22-7.top/images/landscape/construction-factory-lvl3.png" }, { name: "旧4级建材厂", url: "https://scimg.22-7.top/images/landscape/construction-factory-lvl4.png" }] },
                    "construction_factory_tier02.png": { name: "新2级建材厂", presets: [{ name: "旧1级建材厂", url: "https://scimg.22-7.top/images/landscape/construction-factory-lvl1.png" }, { name: "旧2级建材厂", url: "https://scimg.22-7.top/images/landscape/construction-factory-lvl2.png" }, { name: "旧3级建材厂", url: "https://scimg.22-7.top/images/landscape/construction-factory-lvl3.png" }, { name: "旧4级建材厂", url: "https://scimg.22-7.top/images/landscape/construction-factory-lvl4.png" }] },
                    "construction_factory_tier03.png": { name: "新3级建材厂", presets: [{ name: "旧1级建材厂", url: "https://scimg.22-7.top/images/landscape/construction-factory-lvl1.png" }, { name: "旧2级建材厂", url: "https://scimg.22-7.top/images/landscape/construction-factory-lvl2.png" }, { name: "旧3级建材厂", url: "https://scimg.22-7.top/images/landscape/construction-factory-lvl3.png" }, { name: "旧4级建材厂", url: "https://scimg.22-7.top/images/landscape/construction-factory-lvl4.png" }] },
                    "construction_factory_tier04.png": { name: "新6级建材厂", presets: [{ name: "旧1级建材厂", url: "https://scimg.22-7.top/images/landscape/construction-factory-lvl1.png" }, { name: "旧2级建材厂", url: "https://scimg.22-7.top/images/landscape/construction-factory-lvl2.png" }, { name: "旧3级建材厂", url: "https://scimg.22-7.top/images/landscape/construction-factory-lvl3.png" }, { name: "旧4级建材厂", url: "https://scimg.22-7.top/images/landscape/construction-factory-lvl4.png" }] },
                    "construction_factory_tier05.png": { name: "新10级建材厂", presets: [{ name: "旧1级建材厂", url: "https://scimg.22-7.top/images/landscape/construction-factory-lvl1.png" }, { name: "旧2级建材厂", url: "https://scimg.22-7.top/images/landscape/construction-factory-lvl2.png" }, { name: "旧3级建材厂", url: "https://scimg.22-7.top/images/landscape/construction-factory-lvl3.png" }, { name: "旧4级建材厂", url: "https://scimg.22-7.top/images/landscape/construction-factory-lvl4.png" }] },
                    "construction_factory_tier06.png": { name: "新15级建材厂", presets: [{ name: "旧1级建材厂", url: "https://scimg.22-7.top/images/landscape/construction-factory-lvl1.png" }, { name: "旧2级建材厂", url: "https://scimg.22-7.top/images/landscape/construction-factory-lvl2.png" }, { name: "旧3级建材厂", url: "https://scimg.22-7.top/images/landscape/construction-factory-lvl3.png" }, { name: "旧4级建材厂", url: "https://scimg.22-7.top/images/landscape/construction-factory-lvl4.png" }] }
                },
                "总承包商": {
                    "general_contractor_tier01.png": { name: "新1级总承包商", presets: [{ name: "旧1级总承包商", url: "https://scimg.22-7.top/images/landscape/general-contractor-lvl1.png" }, { name: "旧2级总承包商", url: "https://scimg.22-7.top/images/landscape/general-contractor-lvl2.png" }, { name: "旧3级总承包商", url: "https://scimg.22-7.top/images/landscape/general-contractor-lvl3.png" }] },
                    "general_contractor_tier02.png": { name: "新2级总承包商", presets: [{ name: "旧1级总承包商", url: "https://scimg.22-7.top/images/landscape/general-contractor-lvl1.png" }, { name: "旧2级总承包商", url: "https://scimg.22-7.top/images/landscape/general-contractor-lvl2.png" }, { name: "旧3级总承包商", url: "https://scimg.22-7.top/images/landscape/general-contractor-lvl3.png" }] },
                    "general_contractor_tier03.png": { name: "新3级总承包商", presets: [{ name: "旧1级总承包商", url: "https://scimg.22-7.top/images/landscape/general-contractor-lvl1.png" }, { name: "旧2级总承包商", url: "https://scimg.22-7.top/images/landscape/general-contractor-lvl2.png" }, { name: "旧3级总承包商", url: "https://scimg.22-7.top/images/landscape/general-contractor-lvl3.png" }] },
                    "general_contractor_tier04.png": { name: "新6级总承包商", presets: [{ name: "旧1级总承包商", url: "https://scimg.22-7.top/images/landscape/general-contractor-lvl1.png" }, { name: "旧2级总承包商", url: "https://scimg.22-7.top/images/landscape/general-contractor-lvl2.png" }, { name: "旧3级总承包商", url: "https://scimg.22-7.top/images/landscape/general-contractor-lvl3.png" }] },
                    "general_contractor_tier05.png": { name: "新10级总承包商", presets: [{ name: "旧1级总承包商", url: "https://scimg.22-7.top/images/landscape/general-contractor-lvl1.png" }, { name: "旧2级总承包商", url: "https://scimg.22-7.top/images/landscape/general-contractor-lvl2.png" }, { name: "旧3级总承包商", url: "https://scimg.22-7.top/images/landscape/general-contractor-lvl3.png" }] },
                    "general_contractor_tier06.png": { name: "新15级总承包商", presets: [{ name: "旧1级总承包商", url: "https://scimg.22-7.top/images/landscape/general-contractor-lvl1.png" }, { name: "旧2级总承包商", url: "https://scimg.22-7.top/images/landscape/general-contractor-lvl2.png" }, { name: "旧3级总承包商", url: "https://scimg.22-7.top/images/landscape/general-contractor-lvl3.png" }] }
                },
                "屠宰场": {
                    "slaughterhouse-lvl1.png": { name: "1级屠宰场", presets: [{ name: "旧1级屠宰场", url: "https://scimg.22-7.top/images/landscape/slaughterhouse-lvl1.png" }, { name: "旧2级屠宰场", url: "https://scimg.22-7.top/images/landscape/slaughterhouse-lvl2.png" }, { name: "旧3级屠宰场", url: "https://scimg.22-7.top/images/landscape/slaughterhouse-lvl3.png" }] },
                    "slaughterhouse-lvl2.png": { name: "2级屠宰场", presets: [{ name: "旧1级屠宰场", url: "https://scimg.22-7.top/images/landscape/slaughterhouse-lvl1.png" }, { name: "旧2级屠宰场", url: "https://scimg.22-7.top/images/landscape/slaughterhouse-lvl2.png" }, { name: "旧3级屠宰场", url: "https://scimg.22-7.top/images/landscape/slaughterhouse-lvl3.png" }] },
                    "slaughterhouse-lvl3.png": { name: "3级屠宰场", presets: [{ name: "旧1级屠宰场", url: "https://scimg.22-7.top/images/landscape/slaughterhouse-lvl1.png" }, { name: "旧2级屠宰场", url: "https://scimg.22-7.top/images/landscape/slaughterhouse-lvl2.png" }, { name: "旧3级屠宰场", url: "https://scimg.22-7.top/images/landscape/slaughterhouse-lvl3.png" }] }
                },
                "磨坊": {
                    "mill_tier01.png": { name: "新1级磨坊", presets: [{ name: "旧1级磨坊", url: "https://scimg.22-7.top/images/landscape/mill-lvl1.png" }, { name: "旧2级磨坊", url: "https://scimg.22-7.top/images/landscape/mill-lvl2.png" }, { name: "旧3级磨坊", url: "https://scimg.22-7.top/images/landscape/mill-lvl3.png" }] },
                    "mill_tier02.png": { name: "新2级磨坊", presets: [{ name: "旧1级磨坊", url: "https://scimg.22-7.top/images/landscape/mill-lvl1.png" }, { name: "旧2级磨坊", url: "https://scimg.22-7.top/images/landscape/mill-lvl2.png" }, { name: "旧3级磨坊", url: "https://scimg.22-7.top/images/landscape/mill-lvl3.png" }] },
                    "mill_tier03.png": { name: "新3级磨坊", presets: [{ name: "旧1级磨坊", url: "https://scimg.22-7.top/images/landscape/mill-lvl1.png" }, { name: "旧2级磨坊", url: "https://scimg.22-7.top/images/landscape/mill-lvl2.png" }, { name: "旧3级磨坊", url: "https://scimg.22-7.top/images/landscape/mill-lvl3.png" }] },
                    "mill_tier04.png": { name: "新6级磨坊", presets: [{ name: "旧1级磨坊", url: "https://scimg.22-7.top/images/landscape/mill-lvl1.png" }, { name: "旧2级磨坊", url: "https://scimg.22-7.top/images/landscape/mill-lvl2.png" }, { name: "旧3级磨坊", url: "https://scimg.22-7.top/images/landscape/mill-lvl3.png" }] },
                    "mill_tier05.png": { name: "新10级磨坊", presets: [{ name: "旧1级磨坊", url: "https://scimg.22-7.top/images/landscape/mill-lvl1.png" }, { name: "旧2级磨坊", url: "https://scimg.22-7.top/images/landscape/mill-lvl2.png" }, { name: "旧3级磨坊", url: "https://scimg.22-7.top/images/landscape/mill-lvl3.png" }] },
                    "mill_tier06.png": { name: "新15级磨坊", presets: [{ name: "旧1级磨坊", url: "https://scimg.22-7.top/images/landscape/mill-lvl1.png" }, { name: "旧2级磨坊", url: "https://scimg.22-7.top/images/landscape/mill-lvl2.png" }, { name: "旧3级磨坊", url: "https://scimg.22-7.top/images/landscape/mill-lvl3.png" }] },
                },
                "烘焙厂": {
                    "bakery-lvl1.png": { name: "1级烘焙厂", presets: [{ name: "旧1级烘焙厂", url: "https://scimg.22-7.top/images/landscape/bakery-lvl1.png" }, { name: "旧2级烘焙厂", url: "https://scimg.22-7.top/images/landscape/bakery-lvl2.png" }, { name: "旧3级烘焙厂", url: "https://scimg.22-7.top/images/landscape/bakery-lvl3.png" }] },
                    "bakery-lvl2.png": { name: "2级烘焙厂", presets: [{ name: "旧1级烘焙厂", url: "https://scimg.22-7.top/images/landscape/bakery-lvl1.png" }, { name: "旧2级烘焙厂", url: "https://scimg.22-7.top/images/landscape/bakery-lvl2.png" }, { name: "旧3级烘焙厂", url: "https://scimg.22-7.top/images/landscape/bakery-lvl3.png" }] },
                    "bakery-lvl3.png": { name: "3级烘焙厂", presets: [{ name: "旧1级烘焙厂", url: "https://scimg.22-7.top/images/landscape/bakery-lvl1.png" }, { name: "旧2级烘焙厂", url: "https://scimg.22-7.top/images/landscape/bakery-lvl2.png" }, { name: "旧3级烘焙厂", url: "https://scimg.22-7.top/images/landscape/bakery-lvl3.png" }] }
                },
                "食品加工厂": {
                    "food-processing-lvl1.png": { name: "1级食品加工厂", presets: [{ name: "旧1级食品加工厂", url: "https://scimg.22-7.top/images/landscape/food-processing-lvl1.png" }, { name: "旧2级食品加工厂", url: "https://scimg.22-7.top/images/landscape/food-processing-lvl2.png" }, { name: "旧3级食品加工厂", url: "https://scimg.22-7.top/images/landscape/food-processing-lvl3.png" }] },
                    "food-processing-lvl2.png": { name: "2级食品加工厂", presets: [{ name: "旧1级食品加工厂", url: "https://scimg.22-7.top/images/landscape/food-processing-lvl1.png" }, { name: "旧2级食品加工厂", url: "https://scimg.22-7.top/images/landscape/food-processing-lvl2.png" }, { name: "旧3级食品加工厂", url: "https://scimg.22-7.top/images/landscape/food-processing-lvl3.png" }] },
                    "food-processing-lvl3.png": { name: "3级食品加工厂", presets: [{ name: "旧1级食品加工厂", url: "https://scimg.22-7.top/images/landscape/food-processing-lvl1.png" }, { name: "旧2级食品加工厂", url: "https://scimg.22-7.top/images/landscape/food-processing-lvl2.png" }, { name: "旧3级食品加工厂", url: "https://scimg.22-7.top/images/landscape/food-processing-lvl3.png" }] }
                },
                "中央厨房": {
                    "catering-lvl1.png": { name: "1级中央厨房", presets: [{ name: "旧1级中央厨房", url: "https://scimg.22-7.top/images/landscape/catering-lvl1.png" }, { name: "旧2级中央厨房", url: "https://scimg.22-7.top/images/landscape/catering-lvl2.png" }, { name: "旧3级中央厨房", url: "https://scimg.22-7.top/images/landscape/catering-lvl3.png" }] },
                    "catering-lvl2.png": { name: "2级中央厨房", presets: [{ name: "旧1级中央厨房", url: "https://scimg.22-7.top/images/landscape/catering-lvl1.png" }, { name: "旧2级中央厨房", url: "https://scimg.22-7.top/images/landscape/catering-lvl2.png" }, { name: "旧3级中央厨房", url: "https://scimg.22-7.top/images/landscape/catering-lvl3.png" }] },
                    "catering-lvl3.png": { name: "3级中央厨房", presets: [{ name: "旧1级中央厨房", url: "https://scimg.22-7.top/images/landscape/catering-lvl1.png" }, { name: "旧2级中央厨房", url: "https://scimg.22-7.top/images/landscape/catering-lvl2.png" }, { name: "旧3级中央厨房", url: "https://scimg.22-7.top/images/landscape/catering-lvl3.png" }] }
                },
                "森林苗圃": {
                    "forrest_nursery_tier01_back.png": { name: "新1级森林苗圃", presets: [{ name: "旧1级森林苗圃", url: "https://scimg.22-7.top/images/landscape/forest-nursery/shed-lvl1.png" }, { name: "旧2级森林苗圃", url: "https://scimg.22-7.top/images/landscape/forest-nursery/shed-lvl2.png" }, { name: "旧3级森林苗圃", url: "https://scimg.22-7.top/images/landscape/forest-nursery/shed-lvl3.png" }] },
                    "forrest_nursery_tier02_back.png": { name: "新2级森林苗圃", presets: [{ name: "旧1级森林苗圃", url: "https://scimg.22-7.top/images/landscape/forest-nursery/shed-lvl1.png" }, { name: "旧2级森林苗圃", url: "https://scimg.22-7.top/images/landscape/forest-nursery/shed-lvl2.png" }, { name: "旧3级森林苗圃", url: "https://scimg.22-7.top/images/landscape/forest-nursery/shed-lvl3.png" }] },
                    "forrest_nursery_tier03_back.png": { name: "新3级森林苗圃", presets: [{ name: "旧1级森林苗圃", url: "https://scimg.22-7.top/images/landscape/forest-nursery/shed-lvl1.png" }, { name: "旧2级森林苗圃", url: "https://scimg.22-7.top/images/landscape/forest-nursery/shed-lvl2.png" }, { name: "旧3级森林苗圃", url: "https://scimg.22-7.top/images/landscape/forest-nursery/shed-lvl3.png" }] },
                    "forrest_nursery_tier04_back.png": { name: "新6级森林苗圃", presets: [{ name: "旧1级森林苗圃", url: "https://scimg.22-7.top/images/landscape/forest-nursery/shed-lvl1.png" }, { name: "旧2级森林苗圃", url: "https://scimg.22-7.top/images/landscape/forest-nursery/shed-lvl2.png" }, { name: "旧3级森林苗圃", url: "https://scimg.22-7.top/images/landscape/forest-nursery/shed-lvl3.png" }] }
                }
            },
            "零售建筑": {
                "车行": {
                    "car-dealership-lvl1.png": { name: "1级车行", presets: [{ name: "旧1级车行", url: "https://scimg.22-7.top/images/landscape/car-dealership-lvl1.png" }, { name: "旧2级车行", url: "https://scimg.22-7.top/images/landscape/car-dealership-lvl2.png" }] },
                    "car-dealership-lvl2.png": { name: "2级车行", presets: [{ name: "旧1级车行", url: "https://scimg.22-7.top/images/landscape/car-dealership-lvl1.png" }, { name: "旧2级车行", url: "https://scimg.22-7.top/images/landscape/car-dealership-lvl2.png" }] }
                },
                "生鲜商店": {
                    "grocery_store_idle_tier01.png": { name: "新1级生鲜商店", presets: [{ name: "旧1级生鲜商店", url: "https://scimg.22-7.top/images/landscape/grocery2-lvl1.png" }, { name: "旧2级生鲜商店", url: "https://scimg.22-7.top/images/landscape/grocery2-lvl2.png" }, { name: "旧3级生鲜商店", url: "https://scimg.22-7.top/images/landscape/grocery2-lvl3.png" }] },
                    "grocery_store_idle_tier02.png": { name: "新2级生鲜商店", presets: [{ name: "旧1级生鲜商店", url: "https://scimg.22-7.top/images/landscape/grocery2-lvl1.png" }, { name: "旧2级生鲜商店", url: "https://scimg.22-7.top/images/landscape/grocery2-lvl2.png" }, { name: "旧3级生鲜商店", url: "https://scimg.22-7.top/images/landscape/grocery2-lvl3.png" }] },
                    "grocery_store_idle_tier03.png": { name: "新3级生鲜商店", presets: [{ name: "旧1级生鲜商店", url: "https://scimg.22-7.top/images/landscape/grocery2-lvl1.png" }, { name: "旧2级生鲜商店", url: "https://scimg.22-7.top/images/landscape/grocery2-lvl2.png" }, { name: "旧3级生鲜商店", url: "https://scimg.22-7.top/images/landscape/grocery2-lvl3.png" }] },
                    "grocery_store_idle_tier04.png": { name: "新6级生鲜商店", presets: [{ name: "旧1级生鲜商店", url: "https://scimg.22-7.top/images/landscape/grocery2-lvl1.png" }, { name: "旧2级生鲜商店", url: "https://scimg.22-7.top/images/landscape/grocery2-lvl2.png" }, { name: "旧3级生鲜商店", url: "https://scimg.22-7.top/images/landscape/grocery2-lvl3.png" }] },
                    "grocery_store_idle_tier05.png": { name: "新10级生鲜商店", presets: [{ name: "旧1级生鲜商店", url: "https://scimg.22-7.top/images/landscape/grocery2-lvl1.png" }, { name: "旧2级生鲜商店", url: "https://scimg.22-7.top/images/landscape/grocery2-lvl2.png" }, { name: "旧3级生鲜商店", url: "https://scimg.22-7.top/images/landscape/grocery2-lvl3.png" }] },
                    "grocery_store_idle_tier06.png": { name: "新15级生鲜商店", presets: [{ name: "旧1级生鲜商店", url: "https://scimg.22-7.top/images/landscape/grocery2-lvl1.png" }, { name: "旧2级生鲜商店", url: "https://scimg.22-7.top/images/landscape/grocery2-lvl2.png" }, { name: "旧3级生鲜商店", url: "https://scimg.22-7.top/images/landscape/grocery2-lvl3.png" }] }
                },
                "加油站": {
                    "gas_station_tier01.png": { name: "新1级加油站", presets: [{ name: "旧1级加油站", url: "https://scimg.22-7.top/images/landscape/gasstation-lvl1.png" }, { name: "旧2级加油站", url: "https://scimg.22-7.top/images/landscape/gasstation-lvl2.png" }] },
                    "gas_station_tier02.png": { name: "新2级加油站", presets: [{ name: "旧1级加油站", url: "https://scimg.22-7.top/images/landscape/gasstation-lvl1.png" }, { name: "旧2级加油站", url: "https://scimg.22-7.top/images/landscape/gasstation-lvl2.png" }] },
                    "gas_station_tier03.png": { name: "新3级加油站", presets: [{ name: "旧1级加油站", url: "https://scimg.22-7.top/images/landscape/gasstation-lvl1.png" }, { name: "旧2级加油站", url: "https://scimg.22-7.top/images/landscape/gasstation-lvl2.png" }] },
                    "gas_station_tier04.png": { name: "新6级加油站", presets: [{ name: "旧1级加油站", url: "https://scimg.22-7.top/images/landscape/gasstation-lvl1.png" }, { name: "旧2级加油站", url: "https://scimg.22-7.top/images/landscape/gasstation-lvl2.png" }] }
                },
                "时装商店": {
                    "fashion-lvl1.png": { name: "1级时装商店", presets: [{ name: "旧1级时装商店", url: "https://scimg.22-7.top/images/landscape/fashion-lvl1.png" }, { name: "旧2级时装商店", url: "https://scimg.22-7.top/images/landscape/fashion-lvl2.png" }] },
                    "fashion-lvl2.png": { name: "2级时装商店", presets: [{ name: "旧1级时装商店", url: "https://scimg.22-7.top/images/landscape/fashion-lvl1.png" }, { name: "旧2级时装商店", url: "https://scimg.22-7.top/images/landscape/fashion-lvl2.png" }] }
                },
                "销售办公室": {
                    "sales_offices_tier01.png": { name: "新1级销售办公室", presets: [{ name: "旧1级销售办公室", url: "https://scimg.22-7.top/images/landscape/sales-offices-2-lvl1.png" }, { name: "旧2级销售办公室", url: "https://scimg.22-7.top/images/landscape/sales-offices-2-lvl2.png" }, { name: "旧3级销售办公室", url: "https://scimg.22-7.top/images/landscape/sales-offices-2-lvl3.png" }] },
                    "sales_offices_tier02.png": { name: "新2级销售办公室", presets: [{ name: "旧1级销售办公室", url: "https://scimg.22-7.top/images/landscape/sales-offices-2-lvl1.png" }, { name: "旧2级销售办公室", url: "https://scimg.22-7.top/images/landscape/sales-offices-2-lvl2.png" }, { name: "旧3级销售办公室", url: "https://scimg.22-7.top/images/landscape/sales-offices-2-lvl3.png" }] },
                    "sales_offices_tier03.png": { name: "新3级销售办公室", presets: [{ name: "旧1级销售办公室", url: "https://scimg.22-7.top/images/landscape/sales-offices-2-lvl1.png" }, { name: "旧2级销售办公室", url: "https://scimg.22-7.top/images/landscape/sales-offices-2-lvl2.png" }, { name: "旧3级销售办公室", url: "https://scimg.22-7.top/images/landscape/sales-offices-2-lvl3.png" }] },
                    "sales_offices_tier04.png": { name: "新6级销售办公室", presets: [{ name: "旧1级销售办公室", url: "https://scimg.22-7.top/images/landscape/sales-offices-2-lvl1.png" }, { name: "旧2级销售办公室", url: "https://scimg.22-7.top/images/landscape/sales-offices-2-lvl2.png" }, { name: "旧3级销售办公室", url: "https://scimg.22-7.top/images/landscape/sales-offices-2-lvl3.png" }] },
                    "sales_offices_tier05.png": { name: "新10级销售办公室", presets: [{ name: "旧1级销售办公室", url: "https://scimg.22-7.top/images/landscape/sales-offices-2-lvl1.png" }, { name: "旧2级销售办公室", url: "https://scimg.22-7.top/images/landscape/sales-offices-2-lvl2.png" }, { name: "旧3级销售办公室", url: "https://scimg.22-7.top/images/landscape/sales-offices-2-lvl3.png" }] },
                    "sales_offices_tier06.png": { name: "新15级销售办公室", presets: [{ name: "旧1级销售办公室", url: "https://scimg.22-7.top/images/landscape/sales-offices-2-lvl1.png" }, { name: "旧2级销售办公室", url: "https://scimg.22-7.top/images/landscape/sales-offices-2-lvl2.png" }, { name: "旧3级销售办公室", url: "https://scimg.22-7.top/images/landscape/sales-offices-2-lvl3.png" }] }
                },
                "五金商店": {
                    "hardware_store_tier01.png": { name: "新1级五金商店", presets: [{ name: "旧1级五金商店", url: "https://scimg.22-7.top/images/landscape/hardware-store-lvl1.png" }, { name: "旧2级五金商店", url: "https://scimg.22-7.top/images/landscape/hardware-store-lvl2.png" }, { name: "旧3级五金商店", url: "https://scimg.22-7.top/images/landscape/hardware-store-lvl3.png" }] },
                    "hardware_store_tier02.png": { name: "新2级五金商店", presets: [{ name: "旧1级五金商店", url: "https://scimg.22-7.top/images/landscape/hardware-store-lvl1.png" }, { name: "旧2级五金商店", url: "https://scimg.22-7.top/images/landscape/hardware-store-lvl2.png" }, { name: "旧3级五金商店", url: "https://scimg.22-7.top/images/landscape/hardware-store-lvl3.png" }] },
                    "hardware_store_tier03.png": { name: "新3级五金商店", presets: [{ name: "旧1级五金商店", url: "https://scimg.22-7.top/images/landscape/hardware-store-lvl1.png" }, { name: "旧2级五金商店", url: "https://scimg.22-7.top/images/landscape/hardware-store-lvl2.png" }, { name: "旧3级五金商店", url: "https://scimg.22-7.top/images/landscape/hardware-store-lvl3.png" }] },
                    "hardware_store_tier04.png": { name: "新6级五金商店", presets: [{ name: "旧1级五金商店", url: "https://scimg.22-7.top/images/landscape/hardware-store-lvl1.png" }, { name: "旧2级五金商店", url: "https://scimg.22-7.top/images/landscape/hardware-store-lvl2.png" }, { name: "旧3级五金商店", url: "https://scimg.22-7.top/images/landscape/hardware-store-lvl3.png" }] },
                    "hardware_store_tier05.png": { name: "新10级五金商店", presets: [{ name: "旧1级五金商店", url: "https://scimg.22-7.top/images/landscape/hardware-store-lvl1.png" }, { name: "旧2级五金商店", url: "https://scimg.22-7.top/images/landscape/hardware-store-lvl2.png" }, { name: "旧3级五金商店", url: "https://scimg.22-7.top/images/landscape/hardware-store-lvl3.png" }] },
                    "hardware_store_tier06.png": { name: "新15级五金商店", presets: [{ name: "旧1级五金商店", url: "https://scimg.22-7.top/images/landscape/hardware-store-lvl1.png" }, { name: "旧2级五金商店", url: "https://scimg.22-7.top/images/landscape/hardware-store-lvl2.png" }, { name: "旧3级五金商店", url: "https://scimg.22-7.top/images/landscape/hardware-store-lvl3.png" }] }
                },
                "餐馆": {
                    "restaurant-low-lvl1.png": { name: "1级餐馆", presets: [{ name: "旧1级餐馆", url: "https://scimg.22-7.top/images/landscape/restaurant-low-lvl1.png" }, { name: "旧2级餐馆", url: "https://scimg.22-7.top/images/landscape/restaurant-low-lvl2.png" }, { name: "旧3级餐馆", url: "https://scimg.22-7.top/images/landscape/restaurant-low-lvl3.png" }] },
                    "restaurant-low-lvl2.png": { name: "2级餐馆", presets: [{ name: "旧1级餐馆", url: "https://scimg.22-7.top/images/landscape/restaurant-low-lvl1.png" }, { name: "旧2级餐馆", url: "https://scimg.22-7.top/images/landscape/restaurant-low-lvl2.png" }, { name: "旧3级餐馆", url: "https://scimg.22-7.top/images/landscape/restaurant-low-lvl3.png" }] },
                    "restaurant-low-lvl3.png": { name: "3级餐馆", presets: [{ name: "旧1级餐馆", url: "https://scimg.22-7.top/images/landscape/restaurant-low-lvl1.png" }, { name: "旧2级餐馆", url: "https://scimg.22-7.top/images/landscape/restaurant-low-lvl2.png" }, { name: "旧3级餐馆", url: "https://scimg.22-7.top/images/landscape/restaurant-low-lvl3.png" }] }
                }
            },
            "休闲建筑": {
                "城堡": {
                    "castle-lvl1.png": { name: "1级城堡", presets: [{ name: "旧1级城堡", url: "https://scimg.22-7.top/images/landscape/recreational/castle-lvl1.png" }, { name: "旧2级城堡", url: "https://scimg.22-7.top/images/landscape/recreational/castle-lvl2.png" }, { name: "旧3级城堡", url: "https://scimg.22-7.top/images/landscape/recreational/castle-lvl3.png" }] },
                    "castle-lvl2.png": { name: "2级城堡", presets: [{ name: "旧1级城堡", url: "https://scimg.22-7.top/images/landscape/recreational/castle-lvl1.png" }, { name: "旧2级城堡", url: "https://scimg.22-7.top/images/landscape/recreational/castle-lvl2.png" }, { name: "旧3级城堡", url: "https://scimg.22-7.top/images/landscape/recreational/castle-lvl3.png" }] },
                    "castle-lvl3.png": { name: "3级城堡", presets: [{ name: "旧1级城堡", url: "https://scimg.22-7.top/images/landscape/recreational/castle-lvl1.png" }, { name: "旧2级城堡", url: "https://scimg.22-7.top/images/landscape/recreational/castle-lvl2.png" }, { name: "旧3级城堡", url: "https://scimg.22-7.top/images/landscape/recreational/castle-lvl3.png" }] }
                },
                "公园": {
                    "park-lvl1.png": { name: "1级公园", presets: [{ name: "旧1级公园", url: "https://scimg.22-7.top/images/landscape/recreational/park-lvl1.png" }, { name: "旧2级公园", url: "https://scimg.22-7.top/images/landscape/recreational/park-lvl2.png" }, { name: "旧3级公园", url: "https://scimg.22-7.top/images/landscape/recreational/park-lvl3.png" }] },
                    "park-lvl2.png": { name: "2级公园", presets: [{ name: "旧1级公园", url: "https://scimg.22-7.top/images/landscape/recreational/park-lvl1.png" }, { name: "旧2级公园", url: "https://scimg.22-7.top/images/landscape/recreational/park-lvl2.png" }, { name: "旧3级公园", url: "https://scimg.22-7.top/images/landscape/recreational/park-lvl3.png" }] },
                    "park-lvl3.png": { name: "3级公园", presets: [{ name: "旧1级公园", url: "https://scimg.22-7.top/images/landscape/recreational/park-lvl1.png" }, { name: "旧2级公园", url: "https://scimg.22-7.top/images/landscape/recreational/park-lvl2.png" }, { name: "旧3级公园", url: "https://scimg.22-7.top/images/landscape/recreational/park-lvl3.png" }] }
                },
                "人工湖": {
                    "lake2-lvl1.png": { name: "1级人工湖", presets: [{ name: "旧1级人工湖", url: "https://scimg.22-7.top/images/landscape/recreational/lake2-lvl1.png" }, { name: "旧2级人工湖", url: "https://scimg.22-7.top/images/landscape/recreational/lake2-lvl2.png" }, { name: "旧3级人工湖", url: "https://scimg.22-7.top/images/landscape/recreational/lake2-lvl3.png" }] },
                    "lake2-lvl2.png": { name: "2级人工湖", presets: [{ name: "旧1级人工湖", url: "https://scimg.22-7.top/images/landscape/recreational/lake2-lvl1.png" }, { name: "旧2级人工湖", url: "https://scimg.22-7.top/images/landscape/recreational/lake2-lvl2.png" }, { name: "旧3级人工湖", url: "https://scimg.22-7.top/images/landscape/recreational/lake2-lvl3.png" }] },
                    "lake2-lvl3.png": { name: "3级人工湖", presets: [{ name: "旧1级人工湖", url: "https://scimg.22-7.top/images/landscape/recreational/lake2-lvl1.png" }, { name: "旧2级人工湖", url: "https://scimg.22-7.top/images/landscape/recreational/lake2-lvl2.png" }, { name: "旧3级人工湖", url: "https://scimg.22-7.top/images/landscape/recreational/lake2-lvl3.png" }] }
                }
            },
            "科研建筑": {
                "作物研究中心": {
                    "plantresearch.png": { name: "1级作物研究中心", presets: [{ name: "旧1级作物研究中心", url: "https://scimg.22-7.top/images/landscape/plantresearch.png" }] }
                },
                "物理学实验室": {
                    "physics-lab-lvl1.png": { name: "1级物理学实验室", presets: [{ name: "旧1级物理学实验室", url: "https://scimg.22-7.top/images/landscape/physics-lab-lvl1.png" }, { name: "旧2级物理学实验室", url: "https://scimg.22-7.top/images/landscape/physics-lab-lvl2.png" }, { name: "旧3级物理学实验室", url: "https://scimg.22-7.top/images/landscape/physics-lab-lvl3.png" }] },
                    "physics-lab-lvl2.png": { name: "2级物理学实验室", presets: [{ name: "旧1级物理学实验室", url: "https://scimg.22-7.top/images/landscape/physics-lab-lvl1.png" }, { name: "旧2级物理学实验室", url: "https://scimg.22-7.top/images/landscape/physics-lab-lvl2.png" }, { name: "旧3级物理学实验室", url: "https://scimg.22-7.top/images/landscape/physics-lab-lvl3.png" }] },
                    "physics-lab-lvl3.png": { name: "3级物理学实验室", presets: [{ name: "旧1级物理学实验室", url: "https://scimg.22-7.top/images/landscape/physics-lab-lvl1.png" }, { name: "旧2级物理学实验室", url: "https://scimg.22-7.top/images/landscape/physics-lab-lvl2.png" }, { name: "旧3级物理学实验室", url: "https://scimg.22-7.top/images/landscape/physics-lab-lvl3.png" }] }
                },
                "畜牧实验室": {
                    "breeding-research-lvl1.png": { name: "1级畜牧实验室", presets: [{ name: "旧1级畜牧实验室", url: "https://scimg.22-7.top/images/landscape/breeding-research-lvl1.png" }, { name: "旧2级畜牧实验室", url: "https://scimg.22-7.top/images/landscape/breeding-research-lvl2.png" }, { name: "旧3级畜牧实验室", url: "https://scimg.22-7.top/images/landscape/breeding-research-lvl3.png" }] },
                    "breeding-research-lvl2.png": { name: "2级畜牧实验室", presets: [{ name: "旧1级畜牧实验室", url: "https://scimg.22-7.top/images/landscape/breeding-research-lvl1.png" }, { name: "旧2级畜牧实验室", url: "https://scimg.22-7.top/images/landscape/breeding-research-lvl2.png" }, { name: "旧3级畜牧实验室", url: "https://scimg.22-7.top/images/landscape/breeding-research-lvl3.png" }] },
                    "breeding-research-lvl3.png": { name: "3级畜牧实验室", presets: [{ name: "旧1级畜牧实验室", url: "https://scimg.22-7.top/images/landscape/breeding-research-lvl1.png" }, { name: "旧2级畜牧实验室", url: "https://scimg.22-7.top/images/landscape/breeding-research-lvl2.png" }, { name: "旧3级畜牧实验室", url: "https://scimg.22-7.top/images/landscape/breeding-research-lvl3.png" }] }
                },
                "化学实验室": {
                    "chemistry-research-lvl1.png": { name: "1级化学实验室", presets: [{ name: "旧1级化学实验室", url: "https://scimg.22-7.top/images/landscape/chemistry-research-lvl1.png" }, { name: "旧2级化学实验室", url: "https://scimg.22-7.top/images/landscape/chemistry-research-lvl2.png" }, { name: "旧3级化学实验室", url: "https://scimg.22-7.top/images/landscape/chemistry-research-lvl3.png" }] },
                    "chemistry-research-lvl2.png": { name: "2级化学实验室", presets: [{ name: "旧1级化学实验室", url: "https://scimg.22-7.top/images/landscape/chemistry-research-lvl1.png" }, { name: "旧2级化学实验室", url: "https://scimg.22-7.top/images/landscape/chemistry-research-lvl2.png" }, { name: "旧3级化学实验室", url: "https://scimg.22-7.top/images/landscape/chemistry-research-lvl3.png" }] },
                    "chemistry-research-lvl3.png": { name: "3级化学实验室", presets: [{ name: "旧1级化学实验室", url: "https://scimg.22-7.top/images/landscape/chemistry-research-lvl1.png" }, { name: "旧2级化学实验室", url: "https://scimg.22-7.top/images/landscape/chemistry-research-lvl2.png" }, { name: "旧3级化学实验室", url: "https://scimg.22-7.top/images/landscape/chemistry-research-lvl3.png" }] }
                },
                "软件研发院": {
                    "swresearch.png": { name: "1级软件研发院", presets: [{ name: "旧1级软件研发院", url: "https://scimg.22-7.top/images/landscape/swresearch.png" }] }
                },
                "汽车研发所": {
                    "race-track-lvl1.png": { name: "1级汽车研发所", presets: [{ name: "旧1级汽车研发所", url: "https://scimg.22-7.top/images/landscape/race-track-lvl1.png" }, { name: "旧2级汽车研发所", url: "https://scimg.22-7.top/images/landscape/race-track-lvl2.png" }, { name: "旧3级汽车研发所", url: "https://scimg.22-7.top/images/landscape/race-track-lvl3.png" }] },
                    "race-track-lvl2.png": { name: "2级汽车研发所", presets: [{ name: "旧1级汽车研发所", url: "https://scimg.22-7.top/images/landscape/race-track-lvl1.png" }, { name: "旧2级汽车研发所", url: "https://scimg.22-7.top/images/landscape/race-track-lvl2.png" }, { name: "旧3级汽车研发所", url: "https://scimg.22-7.top/images/landscape/race-track-lvl3.png" }] },
                    "race-track-lvl3.png": { name: "3级汽车研发所", presets: [{ name: "旧1级汽车研发所", url: "https://scimg.22-7.top/images/landscape/race-track-lvl1.png" }, { name: "旧2级汽车研发所", url: "https://scimg.22-7.top/images/landscape/race-track-lvl2.png" }, { name: "旧3级汽车研发所", url: "https://scimg.22-7.top/images/landscape/race-track-lvl3.png" }] }
                },
                "时装设计中心": {
                    "fashion-research-lvl1.png": { name: "1级时装设计中心", presets: [{ name: "旧1级时装设计中心", url: "https://scimg.22-7.top/images/landscape/fashion-research-lvl1.png" }, { name: "旧2级时装设计中心", url: "https://scimg.22-7.top/images/landscape/fashion-research-lvl1.png" }, { name: "旧3级时装设计中心", url: "https://scimg.22-7.top/images/landscape/fashion-research-lvl3.png" }] },
                    "fashion-research-lvl1.png": { name: "2级时装设计中心", presets: [{ name: "旧1级时装设计中心", url: "https://scimg.22-7.top/images/landscape/fashion-research-lvl1.png" }, { name: "旧2级时装设计中心", url: "https://scimg.22-7.top/images/landscape/fashion-research-lvl1.png" }, { name: "旧3级时装设计中心", url: "https://scimg.22-7.top/images/landscape/fashion-research-lvl3.png" }] },
                    "fashion-research-lvl3.png": { name: "3级时装设计中心", presets: [{ name: "旧1级时装设计中心", url: "https://scimg.22-7.top/images/landscape/fashion-research-lvl1.png" }, { name: "旧2级时装设计中心", url: "https://scimg.22-7.top/images/landscape/fashion-research-lvl1.png" }, { name: "旧3级时装设计中心", url: "https://scimg.22-7.top/images/landscape/fashion-research-lvl3.png" }] }
                },
                "发射台": {
                    "launchpad-lvl1.png": { name: "1级发射台", presets: [{ name: "旧1级发射台", url: "https://scimg.22-7.top/images/landscape/launchpad-lvl1.png" }, { name: "旧2级发射台", url: "https://scimg.22-7.top/images/landscape/launchpad-lvl2.png" }, { name: "旧3级发射台", url: "https://scimg.22-7.top/images/landscape/launchpad-lvl3.png" }] },
                    "launchpad-lvl2.png": { name: "2级发射台", presets: [{ name: "旧1级发射台", url: "https://scimg.22-7.top/images/landscape/launchpad-lvl1.png" }, { name: "旧2级发射台", url: "https://scimg.22-7.top/images/landscape/launchpad-lvl2.png" }, { name: "旧3级发射台", url: "https://scimg.22-7.top/images/landscape/launchpad-lvl3.png" }] },
                    "launchpad-lvl3.png": { name: "3级发射台", presets: [{ name: "旧1级发射台", url: "https://scimg.22-7.top/images/landscape/launchpad-lvl1.png" }, { name: "旧2级发射台", url: "https://scimg.22-7.top/images/landscape/launchpad-lvl2.png" }, { name: "旧3级发射台", url: "https://scimg.22-7.top/images/landscape/launchpad-lvl3.png" }] }
                },
                "厨房": {
                    "kitchen-lvl1.png": { name: "1级厨房", presets: [{ name: "旧1级厨房", url: "https://scimg.22-7.top/images/landscape/kitchen-lvl1.png" }, { name: "旧2级厨房", url: "https://scimg.22-7.top/images/landscape/kitchen-lvl2.png" }, { name: "旧3级厨房", url: "https://scimg.22-7.top/images/landscape/kitchen-lvl3.png" }] },
                    "kitchen-lvl2.png": { name: "2级厨房", presets: [{ name: "旧1级厨房", url: "https://scimg.22-7.top/images/landscape/kitchen-lvl1.png" }, { name: "旧2级厨房", url: "https://scimg.22-7.top/images/landscape/kitchen-lvl2.png" }, { name: "旧3级厨房", url: "https://scimg.22-7.top/images/landscape/kitchen-lvl3.png" }] },
                    "kitchen-lvl3.png": { name: "3级厨房", presets: [{ name: "旧1级厨房", url: "https://scimg.22-7.top/images/landscape/kitchen-lvl1.png" }, { name: "旧2级厨房", url: "https://scimg.22-7.top/images/landscape/kitchen-lvl2.png" }, { name: "旧3级厨房", url: "https://scimg.22-7.top/images/landscape/kitchen-lvl3.png" }] }
                }
            },
            "其他": {
                "银行": {
                    "bank-lvl1.png": { name: "1级银行", presets: [{ name: "旧1级银行", url: "https://scimg.22-7.top/images/landscape/bank-lvl1.png" }, { name: "旧2级银行", url: "https://scimg.22-7.top/images/landscape/bank-lvl2.png" }, { name: "旧3级银行", url: "https://scimg.22-7.top/images/landscape/bank-lvl3.png" }] },
                    "bank-lvl2.png": { name: "2级银行", presets: [{ name: "旧1级银行", url: "https://scimg.22-7.top/images/landscape/bank-lvl1.png" }, { name: "旧2级银行", url: "https://scimg.22-7.top/images/landscape/bank-lvl2.png" }, { name: "旧3级银行", url: "https://scimg.22-7.top/images/landscape/bank-lvl3.png" }] },
                    "bank-lvl3.png": { name: "3级银行", presets: [{ name: "旧1级银行", url: "https://scimg.22-7.top/images/landscape/bank-lvl1.png" }, { name: "旧2级银行", url: "https://scimg.22-7.top/images/landscape/bank-lvl2.png" }, { name: "旧3级银行", url: "https://scimg.22-7.top/images/landscape/bank-lvl3.png" }] }
                },
                "学院": {
                    "academy-lvl1.png": { name: "1级学院", presets: [{ name: "旧1级学院", url: "https://scimg.22-7.top/images/landscape/academy-lvl1.png" }, { name: "旧2级学院", url: "https://scimg.22-7.top/images/landscape/academy-lvl2.png" }, { name: "旧3级学院", url: "https://scimg.22-7.top/images/landscape/academy-lvl3.png" }, { name: "旧4级学院", url: "https://scimg.22-7.top/images/landscape/academy-lvl4.png" }, { name: "旧5级学院", url: "https://scimg.22-7.top/images/landscape/academy-lvl5.png" }] },
                    "academy-lvl2.png": { name: "2级学院", presets: [{ name: "旧1级学院", url: "https://scimg.22-7.top/images/landscape/academy-lvl1.png" }, { name: "旧2级学院", url: "https://scimg.22-7.top/images/landscape/academy-lvl2.png" }, { name: "旧3级学院", url: "https://scimg.22-7.top/images/landscape/academy-lvl3.png" }, { name: "旧4级学院", url: "https://scimg.22-7.top/images/landscape/academy-lvl4.png" }, { name: "旧5级学院", url: "https://scimg.22-7.top/images/landscape/academy-lvl5.png" }] },
                    "academy-lvl3.png": { name: "3级学院", presets: [{ name: "旧1级学院", url: "https://scimg.22-7.top/images/landscape/academy-lvl1.png" }, { name: "旧2级学院", url: "https://scimg.22-7.top/images/landscape/academy-lvl2.png" }, { name: "旧3级学院", url: "https://scimg.22-7.top/images/landscape/academy-lvl3.png" }, { name: "旧4级学院", url: "https://scimg.22-7.top/images/landscape/academy-lvl4.png" }, { name: "旧5级学院", url: "https://scimg.22-7.top/images/landscape/academy-lvl5.png" }] },
                    "academy-lvl4.png": { name: "4级学院", presets: [{ name: "旧1级学院", url: "https://scimg.22-7.top/images/landscape/academy-lvl1.png" }, { name: "旧2级学院", url: "https://scimg.22-7.top/images/landscape/academy-lvl2.png" }, { name: "旧3级学院", url: "https://scimg.22-7.top/images/landscape/academy-lvl3.png" }, { name: "旧4级学院", url: "https://scimg.22-7.top/images/landscape/academy-lvl4.png" }, { name: "旧5级学院", url: "https://scimg.22-7.top/images/landscape/academy-lvl5.png" }] },
                    "academy-lvl5.png": { name: "5级学院", presets: [{ name: "旧1级学院", url: "https://scimg.22-7.top/images/landscape/academy-lvl1.png" }, { name: "旧2级学院", url: "https://scimg.22-7.top/images/landscape/academy-lvl2.png" }, { name: "旧3级学院", url: "https://scimg.22-7.top/images/landscape/academy-lvl3.png" }, { name: "旧4级学院", url: "https://scimg.22-7.top/images/landscape/academy-lvl4.png" }, { name: "旧5级学院", url: "https://scimg.22-7.top/images/landscape/academy-lvl5.png" }] }
                }
            },
            "季节性设施": {
                "万圣节集市": {
                    "autumn-market-lvl1.png": { name: "1级万圣节集市", presets: [{ name: "旧1级万圣节集市", url: "https://scimg.22-7.top/images/landscape/autumn-market-lvl1.png" }, { name: "旧2级万圣节集市", url: "https://scimg.22-7.top/images/landscape/autumn-market-lvl2.png" }, { name: "旧3级万圣节集市", url: "https://scimg.22-7.top/images/landscape/autumn-market-lvl3.png" }] },
                    "autumn-market-lvl2.png": { name: "2级万圣节集市", presets: [{ name: "旧1级万圣节集市", url: "https://scimg.22-7.top/images/landscape/autumn-market-lvl1.png" }, { name: "旧2级万圣节集市", url: "https://scimg.22-7.top/images/landscape/autumn-market-lvl2.png" }, { name: "旧3级万圣节集市", url: "https://scimg.22-7.top/images/landscape/autumn-market-lvl3.png" }] },
                    "autumn-market-lvl3.png": { name: "3级万圣节集市", presets: [{ name: "旧1级万圣节集市", url: "https://scimg.22-7.top/images/landscape/autumn-market-lvl1.png" }, { name: "旧2级万圣节集市", url: "https://scimg.22-7.top/images/landscape/autumn-market-lvl2.png" }, { name: "旧3级万圣节集市", url: "https://scimg.22-7.top/images/landscape/autumn-market-lvl3.png" }] }
                },
                "Xmas市场": {
                    "xmas-market-lvl1.png": { name: "1级Xmas市场", presets: [{ name: "旧1级Xmas市场", url: "https://scimg.22-7.top/images/landscape/xmas-market-lvl1.png" }, { name: "旧2级Xmas市场", url: "https://scimg.22-7.top/images/landscape/xmas-market-lvl2.png" }, { name: "旧3级Xmas市场", url: "https://scimg.22-7.top/images/landscape/xmas-market-lvl3.png" }] },
                    "xmas-market-lvl2.png": { name: "2级Xmas市场", presets: [{ name: "旧1级Xmas市场", url: "https://scimg.22-7.top/images/landscape/xmas-market-lvl1.png" }, { name: "旧2级Xmas市场", url: "https://scimg.22-7.top/images/landscape/xmas-market-lvl2.png" }, { name: "旧3级Xmas市场", url: "https://scimg.22-7.top/images/landscape/xmas-market-lvl3.png" }] },
                    "xmas-market-lvl3.png": { name: "3级Xmas市场", presets: [{ name: "旧1级Xmas市场", url: "https://scimg.22-7.top/images/landscape/xmas-market-lvl1.png" }, { name: "旧2级Xmas市场", url: "https://scimg.22-7.top/images/landscape/xmas-market-lvl2.png" }, { name: "旧3级Xmas市场", url: "https://scimg.22-7.top/images/landscape/xmas-market-lvl3.png" }] }
                },
                "沙滩集市": {
                    "beach-market-lvl1.png": { name: "1级沙滩集市", presets: [{ name: "旧1级沙滩集市", url: "https://scimg.22-7.top/images/landscape/beach-market-lvl1.png" }, { name: "旧2级沙滩集市", url: "https://scimg.22-7.top/images/landscape/beach-market-lvl2.png" }, { name: "旧3级沙滩集市", url: "https://scimg.22-7.top/images/landscape/beach-market-lvl3.png" }] },
                    "beach-market-lvl2.png": { name: "2级沙滩集市", presets: [{ name: "旧1级沙滩集市", url: "https://scimg.22-7.top/images/landscape/beach-market-lvl1.png" }, { name: "旧2级沙滩集市", url: "https://scimg.22-7.top/images/landscape/beach-market-lvl2.png" }, { name: "旧3级沙滩集市", url: "https://scimg.22-7.top/images/landscape/beach-market-lvl3.png" }] },
                    "beach-market-lvl3.png": { name: "3级沙滩集市", presets: [{ name: "旧1级沙滩集市", url: "https://scimg.22-7.top/images/landscape/beach-market-lvl1.png" }, { name: "旧2级沙滩集市", url: "https://scimg.22-7.top/images/landscape/beach-market-lvl2.png" }, { name: "旧3级沙滩集市", url: "https://scimg.22-7.top/images/landscape/beach-market-lvl3.png" }] }
                },
                "春季集市": {
                    "spring_market_tier01.png": { name: "1级春季集市", presets: [{ name: "旧1级春季集市", url: "https://scimg.22-7.top/images/buildings/seasonal/spring_market_tier01.png" }, { name: "旧2级春季集市", url: "https://scimg.22-7.top/images/buildings/seasonal/spring_market_tier02.png" }, { name: "旧3级春季集市", url: "https://scimg.22-7.top/images/buildings/seasonal/spring_market_tier03.png" }] },
                    "spring_market_tier02.png": { name: "2级春季集市", presets: [{ name: "旧1级春季集市", url: "https://scimg.22-7.top/images/buildings/seasonal/spring_market_tier01.png" }, { name: "旧2级春季集市", url: "https://scimg.22-7.top/images/buildings/seasonal/spring_market_tier02.png" }, { name: "旧3级春季集市", url: "https://scimg.22-7.top/images/buildings/seasonal/spring_market_tier03.png" }] },
                    "spring_market_tier03.png": { name: "3级春季集市", presets: [{ name: "旧1级春季集市", url: "https://scimg.22-7.top/images/buildings/seasonal/spring_market_tier01.png" }, { name: "旧2级春季集市", url: "https://scimg.22-7.top/images/buildings/seasonal/spring_market_tier02.png" }, { name: "旧3级春季集市", url: "https://scimg.22-7.top/images/buildings/seasonal/spring_market_tier03.png" }] }
                }
            }
        },
        "背景和环境": {
            "全局背景": {
                "背景": {
                    "sc_background_main_light_2k_v2.png": { name: "浅色模式", presets: [{ name: "旧浅色模式", url: "https://scimg.22-7.top/images/background.png" }] },
                    "sc_background_main_dark_2k_v2.png": { name: "深色模式", presets: [{ name: "旧深色模式", url: "https://scimg.22-7.top/images/background-dark.png" }] }
                }
            },
            "地图上固定建筑": {
                "交易所": {
                    "exchange_tier01.png": { name: "1级交易所", presets: [{ name: "旧交易所", url: "https://scimg.22-7.top/images/landscape/exchange.png" }] },
                    "exchange_tier02.png": { name: "2级交易所", presets: [{ name: "旧交易所", url: "https://scimg.22-7.top/images/landscape/exchange.png" }] },
                    "exchange_tier03.png": { name: "3级交易所", presets: [{ name: "旧交易所", url: "https://scimg.22-7.top/images/landscape/exchange.png" }] },
                    "exchange_tier04.png": { name: "4级交易所", presets: [{ name: "旧交易所", url: "https://scimg.22-7.top/images/landscape/exchange.png" }] },
                    "exchange_tier05.png": { name: "5级交易所", presets: [{ name: "旧交易所", url: "https://scimg.22-7.top/images/landscape/exchange.png" }] },
                    "exchange_tier06.png": { name: "7级交易所", presets: [{ name: "旧交易所", url: "https://scimg.22-7.top/images/landscape/exchange.png" }] },
                    "exchange_tier07.png": { name: "9级交易所", presets: [{ name: "旧交易所", url: "https://scimg.22-7.top/images/landscape/exchange.png" }] },
                    "exchange_tier08.png": { name: "12级交易所", presets: [{ name: "旧交易所", url: "https://scimg.22-7.top/images/landscape/exchange.png" }] },
                    "exchange_tier09.png": { name: "15级交易所", presets: [{ name: "旧交易所", url: "https://scimg.22-7.top/images/landscape/exchange.png" }] },
                    "exchange_tier10.png": { name: "20级交易所", presets: [{ name: "旧交易所", url: "https://scimg.22-7.top/images/landscape/exchange.png" }] },
                    "exchange_tier11.png": { name: "25级交易所", presets: [{ name: "旧交易所", url: "https://scimg.22-7.top/images/landscape/exchange.png" }] },
                    "exchange_tier12.png": { name: "30级交易所", presets: [{ name: "旧交易所", url: "https://scimg.22-7.top/images/landscape/exchange.png" }] },
                    "exchange_tier13.png": { name: "35级交易所", presets: [{ name: "旧交易所", url: "https://scimg.22-7.top/images/landscape/exchange.png" }] },
                    "exchange_tier14.png": { name: "40级交易所", presets: [{ name: "旧交易所", url: "https://scimg.22-7.top/images/landscape/exchange.png" }] },
                    "exchange_tier15.png": { name: "45级交易所", presets: [{ name: "旧交易所", url: "https://scimg.22-7.top/images/landscape/exchange.png" }] },
                    "exchange_tier16.png": { name: "50级交易所", presets: [{ name: "旧交易所", url: "https://scimg.22-7.top/images/landscape/exchange.png" }] },
                    "exchange_tier17.png": { name: "55级交易所", presets: [{ name: "旧交易所", url: "https://scimg.22-7.top/images/landscape/exchange.png" }] },
                    "exchange_tier18.png": { name: "60级交易所", presets: [{ name: "旧交易所", url: "https://scimg.22-7.top/images/landscape/exchange.png" }] },

                },
                "其它": {
                    "residential_02.png": { name: "residential_02", presets: [{ name: "residential21", url: "https://scimg.22-7.top/images/landscape/decorations/residential21.png" }] },
                    "forrest_02.png": { name: "forrest_02", presets: [{ name: "residential31", url: "https://scimg.22-7.top/images/landscape/decorations/residential31.png" }] },
                    "forrest_03.png": { name: "forrest_03", presets: [{ name: "residential4", url: "https://scimg.22-7.top/images/landscape/decorations/residential4.png" }] },
                    "residential_01.png": { name: "residential_01", presets: [{ name: "residential11", url: "https://scimg.22-7.top/images/landscape/decorations/residential11.png" }] },
                    "park_01.png": { name: "park_01", presets: [{ name: "park", url: "https://scimg.22-7.top/images/landscape/decorations/park.png" }] },
                    "construction_slot_01.png": { name: "construction_slot_01", presets: [{ name: "empty", url: "https://scimg.22-7.top/images/landscape/decorations/empty.png" }] },
                    "construction_slot_02.png": { name: "construction_slot_02", presets: [{ name: "empty2", url: "https://scimg.22-7.top/images/landscape/decorations/empty2.png" }] },
                    "forrest_04.png": { name: "forrest_04", presets: [{ name: "trees", url: "https://scimg.22-7.top/images/landscape/decorations/trees.png" }] },
                    "town_square_01.png": { name: "town_square_01", presets: [{ name: "plaza", url: "https://scimg.22-7.top/images/landscape/decorations/plaza.png" }] }
                }
            },
            "季节性": {
                "地块": {
                    "concrete-0000.png": { name: "concrete-0000", presets: [{ name: "万圣节", url: "https://scimg.22-7.top/images/buildings/tiles/seasonal/concrete-halloween-0000.png" }, { name: "圣诞节", url: "https://scimg.22-7.top/images/buildings/tiles/seasonal/concrete-xmas-0000.png" }, { name: "春季", url: "https://scimg.22-7.top/images/buildings/tiles/seasonal/concrete-spring-0000.png" }] },
                    "concrete-0001.png": { name: "concrete-0001", presets: [{ name: "万圣节", url: "https://scimg.22-7.top/images/buildings/tiles/seasonal/concrete-halloween-0001.png" }, { name: "圣诞节", url: "https://scimg.22-7.top/images/buildings/tiles/seasonal/concrete-xmas-0001.png" }, { name: "春季", url: "https://scimg.22-7.top/images/buildings/tiles/seasonal/concrete-spring-0001.png" }] },
                    "concrete-0010.png": { name: "concrete-0010", presets: [{ name: "万圣节", url: "https://scimg.22-7.top/images/buildings/tiles/seasonal/concrete-halloween-0010.png" }, { name: "圣诞节", url: "https://scimg.22-7.top/images/buildings/tiles/seasonal/concrete-xmas-0010.png" }, { name: "春季", url: "https://scimg.22-7.top/images/buildings/tiles/seasonal/concrete-spring-0010.png" }] },
                    "concrete-0011.png": { name: "concrete-0011", presets: [{ name: "万圣节", url: "https://scimg.22-7.top/images/buildings/tiles/seasonal/concrete-halloween-0011.png" }, { name: "圣诞节", url: "https://scimg.22-7.top/images/buildings/tiles/seasonal/concrete-xmas-0011.png" }, { name: "春季", url: "https://scimg.22-7.top/images/buildings/tiles/seasonal/concrete-spring-0011.png" }] },
                    "concrete-0100.png": { name: "concrete-0100", presets: [{ name: "万圣节", url: "https://scimg.22-7.top/images/buildings/tiles/seasonal/concrete-halloween-0100.png" }, { name: "圣诞节", url: "https://scimg.22-7.top/images/buildings/tiles/seasonal/concrete-xmas-0100.png" }, { name: "春季", url: "https://scimg.22-7.top/images/buildings/tiles/seasonal/concrete-spring-0100.png" }] },
                    "concrete-0110.png": { name: "concrete-0110", presets: [{ name: "万圣节", url: "https://scimg.22-7.top/images/buildings/tiles/seasonal/concrete-halloween-0110.png" }, { name: "圣诞节", url: "https://scimg.22-7.top/images/buildings/tiles/seasonal/concrete-xmas-0110.png" }, { name: "春季", url: "https://scimg.22-7.top/images/buildings/tiles/seasonal/concrete-spring-0110.png" }] },
                    "concrete-1000.png": { name: "concrete-1000", presets: [{ name: "万圣节", url: "https://scimg.22-7.top/images/buildings/tiles/seasonal/concrete-halloween-1000.png" }, { name: "圣诞节", url: "https://scimg.22-7.top/images/buildings/tiles/seasonal/concrete-xmas-1000.png" }, { name: "春季", url: "https://scimg.22-7.top/images/buildings/tiles/seasonal/concrete-spring-1000.png" }] },
                    "concrete-1001.png": { name: "concrete-1001", presets: [{ name: "万圣节", url: "https://scimg.22-7.top/images/buildings/tiles/seasonal/concrete-halloween-1001.png" }, { name: "圣诞节", url: "https://scimg.22-7.top/images/buildings/tiles/seasonal/concrete-xmas-1001.png" }, { name: "春季", url: "https://scimg.22-7.top/images/buildings/tiles/seasonal/concrete-spring-1001.png" }] },
                    "concrete-1100.png": { name: "concrete-1100", presets: [{ name: "万圣节", url: "https://scimg.22-7.top/images/buildings/tiles/seasonal/concrete-halloween-1100.png" }, { name: "圣诞节", url: "https://scimg.22-7.top/images/buildings/tiles/seasonal/concrete-xmas-1100.png" }, { name: "春季", url: "https://scimg.22-7.top/images/buildings/tiles/seasonal/concrete-spring-1100.png" }] },
                    "concrete-1111.png": { name: "concrete-1111", presets: [{ name: "万圣节", url: "https://scimg.22-7.top/images/buildings/tiles/seasonal/concrete-halloween-1111.png" }, { name: "圣诞节", url: "https://scimg.22-7.top/images/buildings/tiles/seasonal/concrete-xmas-1111.png" }, { name: "春季", url: "https://scimg.22-7.top/images/buildings/tiles/seasonal/concrete-spring-1111.png" }] }
                },
                "道路": {
                    "intersection.png": { name: "intersection", presets: [{ name: "圣诞节", url: "https://scimg.22-7.top/images/buildings/roads/seasonal/intersection-xmas.png" }, { name: "春季", url: "https://scimg.22-7.top/images/buildings/roads/seasonal/intersection-spring.png" }] },
                    "road-left-00.png": { name: "intersection", presets: [{ name: "圣诞节", url: "https://scimg.22-7.top/images/buildings/roads/seasonal/road-left-xmas-00.png" }, { name: "春季", url: "https://scimg.22-7.top/images/buildings/roads/seasonal/road-left-spring-00.png" }] },
                    "road-left-01.png": { name: "intersection", presets: [{ name: "圣诞节", url: "https://scimg.22-7.top/images/buildings/roads/seasonal/road-left-xmas-01.png" }, { name: "春季", url: "https://scimg.22-7.top/images/buildings/roads/seasonal/road-left-spring-01.png" }] },
                    "road-left-10.png": { name: "intersection", presets: [{ name: "圣诞节", url: "https://scimg.22-7.top/images/buildings/roads/seasonal/road-left-xmas-10.png" }, { name: "春季", url: "https://scimg.22-7.top/images/buildings/roads/seasonal/road-left-spring-10.png" }] },
                    "road-00.png": { name: "intersection", presets: [{ name: "圣诞节", url: "https://scimg.22-7.top/images/buildings/roads/seasonal/road-xmas-00.png" }, { name: "春季", url: "https://scimg.22-7.top/images/buildings/roads/seasonal/road-spring-00.png" }] },
                    "road-01.png": { name: "intersection", presets: [{ name: "圣诞节", url: "https://scimg.22-7.top/images/buildings/roads/seasonal/road-xmas-01.png" }, { name: "春季", url: "https://scimg.22-7.top/images/buildings/roads/seasonal/road-spring-01.png" }] },
                    "road-10.png": { name: "intersection", presets: [{ name: "圣诞节", url: "https://scimg.22-7.top/images/buildings/roads/seasonal/road-xmas-10.png" }, { name: "春季", url: "https://scimg.22-7.top/images/buildings/roads/seasonal/road-spring-10.png" }] },
                }
            }
        },
        "资源": {
            "农业": {
                "种子": { "seeds.png": { name: "种子", presets: [{ name: "种子", url: "https://scimg.22-7.top/images/resources/seeds.png" }] } },
                "苹果": { "apples.png": { name: "苹果", presets: [{ name: "苹果", url: "https://scimg.22-7.top/images/resources/apples.png" }] } },
                "橘子": { "oranges.png": { name: "橘子", presets: [{ name: "橘子", url: "https://scimg.22-7.top/images/resources/oranges.png" }] } },
                "葡萄": { "grapes.png": { name: "葡萄", presets: [{ name: "葡萄", url: "https://scimg.22-7.top/images/resources/grapes.png" }] } },
                "谷物": { "grain.png": { name: "谷物", presets: [{ name: "谷物", url: "https://scimg.22-7.top/images/resources/grain.png" }] } },
                "甘蔗": { "sugarcane.png": { name: "甘蔗", presets: [{ name: "甘蔗", url: "https://scimg.22-7.top/images/resources/sugarcane.png" }] } },
                "棉花": { "cotton.png": { name: "棉花", presets: [{ name: "棉花", url: "https://scimg.22-7.top/images/resources/cotton.png" }] } },
                "牛": { "cow.png": { name: "牛", presets: [{ name: "牛", url: "https://scimg.22-7.top/images/resources/cow.png" }] } },
                "猪": { "pig.png": { name: "猪", presets: [{ name: "猪", url: "https://scimg.22-7.top/images/resources/pig.png" }] } },
                "咖啡豆": { "coffee-beans.png": { name: "咖啡豆", presets: [{ name: "咖啡豆", url: "https://scimg.22-7.top/images/resources/coffee-beans.png" }] } },
                "可可": { "cocoa-beans.png": { name: "可可", presets: [{ name: "可可", url: "https://scimg.22-7.top/images/resources/cocoa-beans.png" }] } },
                "蔬菜": { "vegetables.png": { name: "蔬菜", presets: [{ name: "蔬菜", url: "https://scimg.22-7.top/images/resources/vegetables.png" }] } },
                "动物饲料": { "fodder.png": { name: "动物饲料", presets: [{ name: "动物饲料", url: "https://scimg.22-7.top/images/resources/fodder.png" }] } }
            },
            "食品加工业": {
                "面团": { "dough.png": { name: "面团", presets: [{ name: "面团", url: "https://scimg.22-7.top/images/resources/dough.png" }] } },
                "酱汁": { "gravy-boat.png": { name: "酱汁", presets: [{ name: "酱汁", url: "https://scimg.22-7.top/images/resources/gravy-boat.png" }] } },
                "牛排": { "steak.png": { name: "牛排", presets: [{ name: "牛排", url: "https://scimg.22-7.top/images/resources/steak.png" }] } },
                "香肠": { "sausages.png": { name: "香肠", presets: [{ name: "香肠", url: "https://scimg.22-7.top/images/resources/sausages.png" }] } },
                "鸡蛋": { "eggs.png": { name: "鸡蛋", presets: [{ name: "鸡蛋", url: "https://scimg.22-7.top/images/resources/eggs.png" }] } },
                "牛奶": { "milk.png": { name: "牛奶", presets: [{ name: "牛奶", url: "https://scimg.22-7.top/images/resources/milk.png" }] } },
                "咖啡粉": { "coffee-ground.png": { name: "咖啡粉", presets: [{ name: "咖啡粉", url: "https://scimg.22-7.top/images/resources/coffee-ground.png" }] } },
                "面粉": { "flour.png": { name: "面粉", presets: [{ name: "面粉", url: "https://scimg.22-7.top/images/resources/flour.png" }] } },
                "面包": { "bread.png": { name: "面包", presets: [{ name: "面包", url: "https://scimg.22-7.top/images/resources/bread.png" }] } },
                "苹果派": { "apple-pie.png": { name: "苹果派", presets: [{ name: "苹果派", url: "https://scimg.22-7.top/images/resources/apple-pie.png" }] } },
                "橙汁": { "orange-juice.png": { name: "橙汁", presets: [{ name: "橙汁", url: "https://scimg.22-7.top/images/resources/orange-juice.png" }] } },
                "苹果汁": { "apple-cider.png": { name: "苹果汁", presets: [{ name: "苹果汁", url: "https://scimg.22-7.top/images/resources/apple-cider.png" }] } },
                "姜汁啤酒": { "ginger-beer.png": { name: "姜汁啤酒", presets: [{ name: "姜汁啤酒", url: "https://scimg.22-7.top/images/resources/ginger-beer.png" }] } },
                "披萨": { "pizza.png": { name: "披萨", presets: [{ name: "披萨", url: "https://scimg.22-7.top/images/resources/pizza.png" }] } },
                "面条": { "pasta.png": { name: "面条", presets: [{ name: "面条", url: "https://scimg.22-7.top/images/resources/pasta.png" }] } },
                "黄油": { "butter.png": { name: "黄油", presets: [{ name: "黄油", url: "https://scimg.22-7.top/images/resources/butter.png" }] } },
                "芝士": { "cheese.png": { name: "芝士", presets: [{ name: "芝士", url: "https://scimg.22-7.top/images/resources/cheese.png" }] } },
                "巧克力": { "chocolate.png": { name: "巧克力", presets: [{ name: "巧克力", url: "https://scimg.22-7.top/images/resources/chocolate.png" }] } },
                "糖": { "sugar.png": { name: "糖", presets: [{ name: "糖", url: "https://scimg.22-7.top/images/resources/sugar.png" }] } },
                "汉堡包": { "hamburger.png": { name: "汉堡包", presets: [{ name: "汉堡包", url: "https://scimg.22-7.top/images/resources/hamburger.png" }] } },
                "千层面": { "lasagna.png": { name: "千层面", presets: [{ name: "千层面", url: "https://scimg.22-7.top/images/resources/lasagna.png" }] } },
                "肉丸": { "meatballs.png": { name: "肉丸", presets: [{ name: "肉丸", url: "https://scimg.22-7.top/images/resources/meatballs.png" }] } },
                "鸡尾酒": { "cocktails.png": { name: "鸡尾酒", presets: [{ name: "鸡尾酒", url: "https://scimg.22-7.top/images/resources/cocktails.png" }] } },
                "植物油": { "vegetable-oil.png": { name: "植物油", presets: [{ name: "植物油", url: "https://scimg.22-7.top/images/resources/vegetable-oil.png" }] } },
                "沙拉": { "salad.png": { name: "沙拉", presets: [{ name: "沙拉", url: "https://scimg.22-7.top/images/resources/salad.png" }] } },
                "咖喱角": { "samosas.png": { name: "咖喱角", presets: [{ name: "咖喱角", url: "https://scimg.22-7.top/images/resources/samosas.png" }] } },
                "南瓜汤": { "pumpkin-soup.png": { name: "南瓜汤", presets: [{ name: "南瓜汤", url: "https://scimg.22-7.top/images/resources/pumpkin-soup.png" }] } }
            },
            "建设": {
                "木材": { "wood.png": { name: "木材", presets: [{ name: "木材", url: "https://scimg.22-7.top/images/resources/wood.png" }] } },
                "钢筋混凝土": { "reinforced-concrete.png": { name: "钢筋混凝土", presets: [{ name: "钢筋混凝土", url: "https://scimg.22-7.top/images/resources/reinforced-concrete.png" }] } },
                "砖块": { "bricks.png": { name: "砖块", presets: [{ name: "砖块", url: "https://scimg.22-7.top/images/resources/bricks.png" }] } },
                "水泥": { "cement.png": { name: "水泥", presets: [{ name: "水泥", url: "https://scimg.22-7.top/images/resources/cement.png" }] } },
                "黏土": { "clay.png": { name: "黏土", presets: [{ name: "黏土", url: "https://scimg.22-7.top/images/resources/clay.png" }] } },
                "石灰石": { "limestone.png": { name: "石灰石", presets: [{ name: "石灰石", url: "https://scimg.22-7.top/images/resources/limestone.png" }] } },
                "钢筋": { "steel-beams.png": { name: "钢筋", presets: [{ name: "钢筋", url: "https://scimg.22-7.top/images/resources/steel-beams.png" }] } },
                "木板": { "planks.png": { name: "木板", presets: [{ name: "木板", url: "https://scimg.22-7.top/images/resources/planks.png" }] } },
                "窗户": { "windows.png": { name: "窗户", presets: [{ name: "窗户", url: "https://scimg.22-7.top/images/resources/windows.png" }] } },
                "工具": { "tools.png": { name: "工具", presets: [{ name: "工具", url: "https://scimg.22-7.top/images/resources/tools.png" }] } },
                "建筑预构件": { "construction-units.png": { name: "建筑预构件", presets: [{ name: "建筑预构件", url: "https://scimg.22-7.top/images/resources/construction-units.png" }] } }
            },
            "时装业": {
                "棉布": { "fabric.png": { name: "棉布", presets: [{ name: "棉布", url: "https://scimg.22-7.top/images/resources/fabric.png" }] } },
                "皮革": { "leather.png": { name: "皮革", presets: [{ name: "皮革", url: "https://scimg.22-7.top/images/resources/leather.png" }] } },
                "内衣": { "underwear.png": { name: "内衣", presets: [{ name: "内衣", url: "https://scimg.22-7.top/images/resources/underwear.png" }] } },
                "手套": { "gloves.png": { name: "手套", presets: [{ name: "手套", url: "https://scimg.22-7.top/images/resources/gloves.png" }] } },
                "裙子": { "dress.png": { name: "裙子", presets: [{ name: "裙子", url: "https://scimg.22-7.top/images/resources/dress.png" }] } },
                "高跟鞋": { "simmi-shoes.png": { name: "高跟鞋", presets: [{ name: "高跟鞋", url: "https://scimg.22-7.top/images/resources/simmi-shoes.png" }] } },
                "手袋": { "handbags.png": { name: "手袋", presets: [{ name: "手袋", url: "https://scimg.22-7.top/images/resources/handbags.png" }] } },
                "运动鞋": { "sneakers.png": { name: "运动鞋", presets: [{ name: "运动鞋", url: "https://scimg.22-7.top/images/resources/sneakers.png" }] } },
                "名牌手表": { "gold-watch.png": { name: "名牌手表", presets: [{ name: "名牌手表", url: "https://scimg.22-7.top/images/resources/gold-watch.png" }] } },
                "项链": { "necklace.png": { name: "项链", presets: [{ name: "项链", url: "https://scimg.22-7.top/images/resources/necklace.png" }] } }
            },
            "能源行业": {
                "原油": { "crude-oil.png": { name: "原油", presets: [{ name: "原油", url: "https://scimg.22-7.top/images/resources/crude-oil.png" }] } },
                "汽油": { "petrol.png": { name: "汽油", presets: [{ name: "汽油", url: "https://scimg.22-7.top/images/resources/petrol.png" }] } },
                "柴油": { "diesel.png": { name: "柴油", presets: [{ name: "柴油", url: "https://scimg.22-7.top/images/resources/diesel.png" }] } },
                "电力": { "power.png": { name: "电力", presets: [{ name: "电力", url: "https://scimg.22-7.top/images/resources/power.png" }] } },
                "乙醇": { "ethanol.png": { name: "乙醇", presets: [{ name: "乙醇", url: "https://scimg.22-7.top/images/resources/ethanol.png" }] } },
                "甲烷": { "methane.png": { name: "甲烷", presets: [{ name: "甲烷", url: "https://scimg.22-7.top/images/resources/methane.png" }] } },
                "火箭燃料": { "rocket-fuel.png": { name: "火箭燃料", presets: [{ name: "火箭燃料", url: "https://scimg.22-7.top/images/resources/rocket-fuel.png" }] } }
            },
            "电子产品制造业": {
                "处理器": { "processors.png": { name: "处理器", presets: [{ name: "处理器", url: "https://scimg.22-7.top/images/resources/processors.png" }] } },
                "电子元件": { "electronic-components.png": { name: "电子元件", presets: [{ name: "电子元件", url: "https://scimg.22-7.top/images/resources/electronic-components.png" }] } },
                "电池": { "batteries.png": { name: "电池", presets: [{ name: "电池", url: "https://scimg.22-7.top/images/resources/batteries.png" }] } },
                "显示屏": { "displays.png": { name: "显示屏", presets: [{ name: "显示屏", url: "https://scimg.22-7.top/images/resources/displays.png" }] } },
                "智能手机": { "smart-phones.png": { name: "智能手机", presets: [{ name: "智能手机", url: "https://scimg.22-7.top/images/resources/smart-phones.png" }] } },
                "平板电脑": { "tablets.png": { name: "平板电脑", presets: [{ name: "平板电脑", url: "https://scimg.22-7.top/images/resources/tablets.png" }] } },
                "笔记本电脑": { "laptops.png": { name: "笔记本电脑", presets: [{ name: "笔记本电脑", url: "https://scimg.22-7.top/images/resources/laptops.png" }] } },
                "显示器": { "monitors.png": { name: "显示器", presets: [{ name: "显示器", url: "https://scimg.22-7.top/images/resources/monitors.png" }] } },
                "电视机": { "televisions.png": { name: "电视机", presets: [{ name: "电视机", url: "https://scimg.22-7.top/images/resources/televisions.png" }] } },
                "精密电子元件": { "high-grade-e-components.png": { name: "精密电子元件", presets: [{ name: "精密电子元件", url: "https://scimg.22-7.top/images/resources/high-grade-e-components.png" }] } },
                "无人机": { "quadcopter.png": { name: "无人机", presets: [{ name: "无人机", url: "https://scimg.22-7.top/images/resources/quadcopter.png" }] } },
                "机器人": { "robots.png": { name: "机器人", presets: [{ name: "机器人", url: "https://scimg.22-7.top/images/resources/robots.png" }] } }
            },
            "汽车制造业": {
                "车载电脑": { "on-board-computer.png": { name: "车载电脑", presets: [{ name: "车载电脑", url: "https://scimg.22-7.top/images/resources/on-board-computer.png" }] } },
                "电动马达": { "electric-motor.png": { name: "电动马达", presets: [{ name: "电动马达", url: "https://scimg.22-7.top/images/resources/electric-motor.png" }] } },
                "豪华车内饰": { "luxury-car-interior.png": { name: "豪华车内饰", presets: [{ name: "豪华车内饰", url: "https://scimg.22-7.top/images/resources/luxury-car-interior.png" }] } },
                "基本内饰": { "car-interior.png": { name: "基本内饰", presets: [{ name: "基本内饰", url: "https://scimg.22-7.top/images/resources/car-interior.png" }] } },
                "车身": { "car-body.png": { name: "车身", presets: [{ name: "车身", url: "https://scimg.22-7.top/images/resources/car-body.png" }] } },
                "内燃机": { "combustion-engine.png": { name: "内燃机", presets: [{ name: "内燃机", url: "https://scimg.22-7.top/images/resources/combustion-engine.png" }] } },
                "经济电动车": { "economy-e-car.png": { name: "经济电动车", presets: [{ name: "经济电动车", url: "https://scimg.22-7.top/images/resources/economy-e-car.png" }] } },
                "豪华电动车": { "luxury-e-car.png": { name: "豪华电动车", presets: [{ name: "豪华电动车", url: "https://scimg.22-7.top/images/resources/luxury-e-car.png" }] } },
                "经济燃油车": { "economy-car.png": { name: "经济燃油车", presets: [{ name: "经济燃油车", url: "https://scimg.22-7.top/images/resources/economy-car.png" }] } },
                "豪华燃油车": { "luxury-car.png": { name: "豪华燃油车", presets: [{ name: "豪华燃油车", url: "https://scimg.22-7.top/images/resources/luxury-car.png" }] } },
                "卡车": { "truck.png": { name: "卡车", presets: [{ name: "卡车", url: "https://scimg.22-7.top/images/resources/truck.png" }] } },
                "推土机": { "bulldozer.png": { name: "推土机", presets: [{ name: "推土机", url: "https://scimg.22-7.top/images/resources/bulldozer.png" }] } }
            },
            "航空航天制造业": {
                "机身": { "fuselage.png": { name: "机身", presets: [{ name: "机身", url: "https://scimg.22-7.top/images/resources/fuselage.png" }] } },
                "机翼": { "wing.png": { name: "机翼", presets: [{ name: "机翼", url: "https://scimg.22-7.top/images/resources/wing.png" }] } },
                "飞行计算机": { "flight-computer.png": { name: "飞行计算机", presets: [{ name: "飞行计算机", url: "https://scimg.22-7.top/images/resources/flight-computer.png" }] } },
                "座舱": { "cockpit.png": { name: "座舱", presets: [{ name: "座舱", url: "https://scimg.22-7.top/images/resources/cockpit.png" }] } },
                "姿态控制器": { "attitude-control.png": { name: "姿态控制器", presets: [{ name: "姿态控制器", url: "https://scimg.22-7.top/images/resources/attitude-control.png" }] } },
                "燃料储罐": { "fuel-tank.png": { name: "燃料储罐", presets: [{ name: "燃料储罐", url: "https://scimg.22-7.top/images/resources/fuel-tank.png" }] } },
                "固体燃料助推器": { "solid-rocket.png": { name: "固体燃料助推器", presets: [{ name: "固体燃料助推器", url: "https://scimg.22-7.top/images/resources/solid-rocket.png" }] } },
                "火箭发动机": { "rocket-engine.png": { name: "火箭发动机", presets: [{ name: "火箭发动机", url: "https://scimg.22-7.top/images/resources/rocket-engine.png" }] } },
                "隔热板": { "heat-shield.png": { name: "隔热板", presets: [{ name: "隔热板", url: "https://scimg.22-7.top/images/resources/heat-shield.png" }] } },
                "离子推进器": { "ion-drive.png": { name: "离子推进器", presets: [{ name: "离子推进器", url: "https://scimg.22-7.top/images/resources/ion-drive.png" }] } },
                "喷气发动机": { "jet-engine.png": { name: "喷气发动机", presets: [{ name: "喷气发动机", url: "https://scimg.22-7.top/images/resources/jet-engine.png" }] } },
                "亚轨道火箭": { "sub-orbital-rocket2.png": { name: "亚轨道火箭", presets: [{ name: "亚轨道火箭", url: "https://scimg.22-7.top/images/resources/sub-orbital-rocket2.png" }] } },
                "BFR": { "BFR.png": { name: "BFR", presets: [{ name: "BFR", url: "https://scimg.22-7.top/images/resources/BFR.png" }] } },
                "喷气客机": { "jumbojet2.png": { name: "喷气客机", presets: [{ name: "喷气客机", url: "https://scimg.22-7.top/images/resources/jumbojet2.png" }] } },
                "豪华飞机": { "private-jet.png": { name: "豪华飞机", presets: [{ name: "豪华飞机", url: "https://scimg.22-7.top/images/resources/private-jet.png" }] } },
                "单引擎飞机": { "single-engine.png": { name: "单引擎飞机", presets: [{ name: "单引擎飞机", url: "https://scimg.22-7.top/images/resources/single-engine.png" }] } },
                "人造卫星": { "satellite.png": { name: "人造卫星", presets: [{ name: "人造卫星", url: "https://scimg.22-7.top/images/resources/satellite.png" }] } },
            },
            "原材料加工业": {
                "水": { "water.png": { name: "水", presets: [{ name: "水", url: "https://scimg.22-7.top/images/resources/water.png" }] } },
                "运输单位": { "transport.png": { name: "运输单位", presets: [{ name: "运输单位", url: "https://scimg.22-7.top/images/resources/transport.png" }] } },
                "矿物": { "minerals.png": { name: "矿物", presets: [{ name: "矿物", url: "https://scimg.22-7.top/images/resources/minerals.png" }] } },
                "铝土矿": { "bauxite.png": { name: "铝土矿", presets: [{ name: "铝土矿", url: "https://scimg.22-7.top/images/resources/bauxite.png" }] } },
                "硅材": { "silicon.png": { name: "硅材", presets: [{ name: "硅材", url: "https://scimg.22-7.top/images/resources/silicon.png" }] } },
                "化合物": { "chemicals.png": { name: "化合物", presets: [{ name: "化合物", url: "https://scimg.22-7.top/images/resources/chemicals.png" }] } },
                "铝材": { "aluminium.png": { name: "铝材", presets: [{ name: "铝材", url: "https://scimg.22-7.top/images/resources/aluminium.png" }] } },
                "塑料": { "plastic.png": { name: "塑料", presets: [{ name: "塑料", url: "https://scimg.22-7.top/images/resources/plastic.png" }] } },
                "铁矿石": { "iron-ore.png": { name: "铁矿石", presets: [{ name: "铁矿石", url: "https://scimg.22-7.top/images/resources/iron-ore.png" }] } },
                "钢材": { "steel.png": { name: "钢材", presets: [{ name: "钢材", url: "https://scimg.22-7.top/images/resources/steel.png" }] } },
                "沙子": { "sand.png": { name: "沙子", presets: [{ name: "沙子", url: "https://scimg.22-7.top/images/resources/sand.png" }] } },
                "玻璃": { "glass.png": { name: "玻璃", presets: [{ name: "玻璃", url: "https://scimg.22-7.top/images/resources/glass.png" }] } },
                "金矿石": { "gold-ore.png": { name: "金矿石", presets: [{ name: "金矿石", url: "https://scimg.22-7.top/images/resources/gold-ore.png" }] } },
                "金条": { "golden-bars.png": { name: "金条", presets: [{ name: "金条", url: "https://scimg.22-7.top/images/resources/golden-bars.png" }] } },
                "碳纤维": { "carbon-fiber.png": { name: "碳纤维", presets: [{ name: "碳纤维", url: "https://scimg.22-7.top/images/resources/carbon-fiber.png" }] } },
                "碳纤复合材": { "carbon-composite.png": { name: "碳纤复合材", presets: [{ name: "碳纤复合材", url: "https://scimg.22-7.top/images/resources/carbon-composite.png" }] } }
            },
            "科研行业": {
                "作物研究": { "plant-research.png": { name: "作物研究", presets: [{ name: "作物研究", url: "https://scimg.22-7.top/images/resources/plant-research.png" }] } },
                "能源研究": { "energy-research.png": { name: "能源研究", presets: [{ name: "能源研究", url: "https://scimg.22-7.top/images/resources/energy-research.png" }] } },
                "采矿研究": { "mining-research.png": { name: "采矿研究", presets: [{ name: "采矿研究", url: "https://scimg.22-7.top/images/resources/mining-research.png" }] } },
                "电器研究": { "electronics-research.png": { name: "电器研究", presets: [{ name: "电器研究", url: "https://scimg.22-7.top/images/resources/electronics-research.png" }] } },
                "畜牧研究": { "breeding-research.png": { name: "畜牧研究", presets: [{ name: "畜牧研究", url: "https://scimg.22-7.top/images/resources/breeding-research.png" }] } },
                "化学研究": { "chemistry-research.png": { name: "化学研究", presets: [{ name: "化学研究", url: "https://scimg.22-7.top/images/resources/chemistry-research.png" }] } },
                "软件": { "software.png": { name: "软件", presets: [{ name: "软件", url: "https://scimg.22-7.top/images/resources/software.png" }] } },
                "汽车研究": { "automotive-research.png": { name: "汽车研究", presets: [{ name: "汽车研究", url: "https://scimg.22-7.top/images/resources/automotive-research.png" }] } },
                "时装研究": { "fashion-research.png": { name: "时装研究", presets: [{ name: "时装研究", url: "https://scimg.22-7.top/images/resources/fashion-research.png" }] } },
                "航空航天研究": { "aero-research.png": { name: "航空航天研究", presets: [{ name: "航空航天研究", url: "https://scimg.22-7.top/images/resources/aero-research.png" }] } },
                "材料研究": { "materials-research.png": { name: "材料研究", presets: [{ name: "材料研究", url: "https://scimg.22-7.top/images/resources/materials-research.png" }] } },
                "食谱": { "recipes.png": { name: "食谱", presets: [{ name: "食谱", url: "https://scimg.22-7.top/images/resources/recipes.png" }] } }
            },
            "季节性": {
                "南瓜": { "pumpkin.png": { name: "南瓜", presets: [{ name: "南瓜", url: "https://scimg.22-7.top/images/resources/pumpkin.png" }] } },
                "复活节兔兔": { "easter-bunny.png": { name: "复活节兔兔", presets: [{ name: "旧复活节兔兔", url: "https://scimg.22-7.top/images/resources/easter-bunny_old01.png" }] } },
                "奶油鸡蛋": { "cream-egg.png": { name: "奶油鸡蛋", presets: [{ name: "Cream egg", url: "https://scimg.22-7.top/images/resources/cream-egg.png" }] } },
                "圣诞爆竹": { "xmas-crackers.png": { name: "圣诞爆竹", presets: [{ name: "旧圣诞爆竹", url: "https://scimg.22-7.top/images/resources/xmas-crackers_old01.png" }] } },
                "圣诞装饰品": { "xmas-ornament.png": { name: "圣诞装饰品", presets: [{ name: "旧圣诞装饰品", url: "https://scimg.22-7.top/images/resources/xmas-ornament_old01.png" }] } },
                "杰克灯笼": { "jack-o-lantern.png": { name: "杰克灯笼", presets: [{ name: "杰克灯笼", url: "https://scimg.22-7.top/images/resources/jack-o-lantern.png" }] } },
                "女巫服": { "witch-costume.png": { name: "女巫服", presets: [{ name: "女巫服", url: "https://scimg.22-7.top/images/resources/witch-costume.png" }] } },
                "树": { "tree.png": { name: "树", presets: [{ name: "树", url: "https://scimg.22-7.top/images/resources/tree.png" }] } },
                "斋月糖果": { "ramadan-sweets.png": { name: "斋月糖果", presets: [{ name: "斋月糖果", url: "https://scimg.22-7.top/images/resources/ramadan-sweets.png" }] } },
                "巧克力冰淇淋": { "icecream-chocolate.png": { name: "巧克力冰淇淋", presets: [{ name: "巧克力冰淇淋", url: "https://scimg.22-7.top/images/resources/icecream-chocolate.png" }] } },
                "苹果冰淇淋": { "icecream-apple.png": { name: "苹果冰淇淋", presets: [{ name: "苹果冰淇淋", url: "https://scimg.22-7.top/images/resources/icecream-apple.png" }] } }
            }
        }
    };


    // 声明为 let，允许被外部配置覆盖
    let PATH_MAP = { ...DEFAULT_PATH_MAP };
    let UI_MANIFEST = JSON.parse(JSON.stringify(DEFAULT_UI_MANIFEST));

    // ==========================================
    // 新增：远程配置与数据管理器
    // ==========================================
    const ConfigManager = {
        LOCAL_CACHE_KEY: 'SC_SKIN_REMOTE_CONFIG',
        currentVersion: 0, // 当前运行的版本号

        init() {
            // 1. 启动时瞬间读取本地缓存，不阻塞页面加载
            try {
                const cache = localStorage.getItem(this.LOCAL_CACHE_KEY);
                if (cache) {
                    const parsed = JSON.parse(cache);
                    if (parsed.uiManifest && parsed.pathMap) {
                        UI_MANIFEST = parsed.uiManifest;
                        PATH_MAP = parsed.pathMap;
                        this.currentVersion = parsed.version || 0;
                        console.log(`[SC-Skin] 已加载本地配置缓存，当前数据版本: ${this.currentVersion}`);
                    }
                }
            } catch (e) {
                console.warn('[SC-Skin] 读取缓存配置失败，使用默认内置配置', e);
            }

            // 2. 启动后，在后台静默检查是否有新版本
            this.checkAutoUpdate();
        },

        async checkAutoUpdate() {
            try {
                // 使用小时级的时间戳，防止死缓存
                const cacheBuster = Math.floor(Date.now());
                const url = `https://sc.22-7.top/scripts/oldBuildingsGraphicConfig.json?t=${cacheBuster}`;

                const response = await fetch(url);
                if (!response.ok) return;

                const remoteData = await response.json();
                const remoteVersion = remoteData.version || 0;

                if (remoteVersion > this.currentVersion) {
                    console.log(`[SC-Skin] ⬇️ 发现新版图库数据 (v${remoteVersion})，执行热替换...`);

                    // 保存到本地缓存
                    localStorage.setItem(this.LOCAL_CACHE_KEY, JSON.stringify(remoteData));

                    // 动态更新内存中的数据
                    UI_MANIFEST = remoteData.uiManifest;
                    PATH_MAP = remoteData.pathMap;
                    this.currentVersion = remoteVersion;

                    // ==========================================
                    // 🔥 核心：热替换 (Hot Reload) 逻辑
                    // ==========================================
                    // 1. 重新解析全新的 UI_MANIFEST，提取最新的图片 Key 列表
                    Settings.init();

                    // 2. 如果设置面板当前已经存在于页面上，强制刷新它的 UI
                    if (typeof SCobgUIManager !== 'undefined' && SCobgUIManager.panel) {
                        SCobgUIManager.renderSidebar(); // 重新生成左侧树形菜单

                        const content = SCobgUIManager.panel.querySelector('.scobg-content');
                        if (content) {
                            // 清空右侧详情区，提示用户重新点击，避免旧菜单绑定旧数据的报错
                            content.innerHTML = `
                                <div style="height:100%; display:flex; align-items:center; justify-content:center; color:#555; flex-direction:column; gap:10px;">
                                    <span style="font-size:40px;">🔄</span>
                                    <span>图库已实时更新，请在侧边栏重新选择分类</span>
                                </div>`;
                        }
                    }

                    // 3. 触发全局扫描器，瞬间替换游戏地图和背景上的图片！
                    if (typeof Scheduler !== 'undefined') {
                        Scheduler.scanAll();
                    }
                    // ==========================================

                    this.showUpdateNotification();
                }
            } catch (err) {
                console.error('[SC-Skin] 后台更新数据失败:', err);
            }
        },

    };

    // ==========================================
    // 2. Settings 模块 (数据管理中心)
    // ==========================================
    const Settings = {
        data: {}, // 存储用户的自定义设置 { "power_plant_tier01.png": { enabled: true, target: "url" } }
        allKeys: [], // 存储所有在 UI_MANIFEST 中定义的图片 key

        init() {
            // 1. 加载本地存储的用户设置
            try {
                const localRaw = localStorage.getItem(CONSTANTS.STORAGE_KEY);
                if (localRaw) {
                    this.data = JSON.parse(localRaw);
                } else {
                    this.data = {};
                }
            } catch (e) {
                console.error('[SC-Skin] 加载配置失败，将使用默认配置:', e);
                this.data = {};
            }

            // 2. 从 UI_MANIFEST 递归提取所有图片 key
            this.allKeys = [];
            const traverse = (obj) => {
                for (let k in obj) {
                    if (k.endsWith('.png')) {
                        this.allKeys.push(k);
                    } else if (typeof obj[k] === 'object') {
                        traverse(obj[k]);
                    }
                }
            };
            traverse(UI_MANIFEST);
            console.log('[SC-Skin] 配置已加载');
        },

        save() {
            localStorage.setItem(CONSTANTS.STORAGE_KEY, JSON.stringify(this.data));
        },

        /**
         * 核心：通过原文件名获取新 CDN URL (逻辑来自 oldBuildingsGraphic)
         * @param {string} originalUrl - 原始图片 URL
         * @returns {string|null} - 替换后的 URL 或 null
         */
        getReplacementUrl(originalUrl) {
            if (!originalUrl) return null;
            const fullFileName = originalUrl.split('/').pop().split('?')[0].toLowerCase();

            for (const key of this.allKeys) {
                // 只有当 manifest 里的 key (如 construction_factory_tier06) 
                // 确实出现在文件名中时才继续
                const baseKey = key.replace('.png', '').toLowerCase();

                if (fullFileName.includes(baseKey)) {
                    const config = this.data[key];
                    if (config && config.enabled && config.target) {
                        // 如果需要验证逻辑，可以在此处 append Token
                        return config.target;
                    }
                    // 注意：这里不要 return null，因为可能后续的 key 才是真正匹配的
                }
            }
            return null;
        }
    };
    Settings.init();


    // ==========================================
    // 3. 样式管理 (主题背景)
    // ==========================================
    const StyleManager = {
        init() {
            const style = document.createElement('style');
            style.id = 'sc-skin-global-style';
            style.textContent = `
                /* 只有当变量 --sc-custom-bg 有值且不是 initial 时，才强制应用 */
                #page.has-custom-bg, 
                #page.has-custom-bg::before, 
                #page.has-custom-bg::after { 
                    background-image: var(--sc-custom-bg) !important; 
                }
                
                /* 详情页强制清除背景的逻辑保留 */
                body.is-building-detail #page, 
                body.is-building-detail #page::before, 
                body.is-building-detail #page::after {
                    background-image: none !important;
                }
            `;
            document.head.appendChild(style);
            this.updateTheme();
        },

        updateTheme() {
            const pageEl = document.getElementById('page');
            if (!pageEl) return;

            // 1. 详情页判定
            const isDetail = /\/landscape\/buildings\/\d+\/?$/.test(location.pathname);
            document.body.classList.toggle('is-building-detail', isDetail);
            if (isDetail) return;

            // 2. 根据当前模式确定 manifest 中的 key
            const currentTheme = localStorage.getItem(CONSTANTS.THEME_KEY) || 'Light';
            const bgKey = currentTheme === 'Dark' ? 'background-dark.png' : 'background.png';

            // 3. 【核心修改】：像普通图片一样去询问 Settings
            // getReplacementUrl 内部会检查：allKeys 是否包含此 key，以及用户是否启用了它
            const newUrl = Settings.getReplacementUrl(bgKey);

            if (newUrl) {
                // 只有 manifest 里配置了且用户开启了，才应用
                document.documentElement.style.setProperty('--sc-custom-bg', `url("${newUrl}")`);
                pageEl.classList.add('has-custom-bg');
            } else {
                // 否则，彻底移除自定义样式，让游戏回归原始背景
                document.documentElement.style.removeProperty('--sc-custom-bg');
                pageEl.classList.remove('has-custom-bg');
            }
        }
    };


    // ==========================================
    // 4. 核心逻辑：DOM 处理器 (来自 oldBuildingsGraphic)
    // ==========================================
    const DOMProcessor = {
        originalImageMap: new Map(), // 新增：存储 imageName -> fullOriginalUrl 的映射

        processImg(img) {
            if (!img.src) return;

            // 1. 保护机制：绝对不处理设置面板内的 UI 图片
            if (img.classList.contains('scobg-ui-img') || img.closest('#scobg-panel')) return;

            // 2. 记录原始身世 (只在第一次遇到时记录)
            // 如果没有记录过原始地址，说明这是第一次扫描到它
            if (!img.dataset.scOriginalSrc) {
                img.dataset.scOriginalSrc = img.src;
            }

            // 3. 获取“真名” (始终基于原始 URL 判断，而不是基于当前可能已经被改过的 URL)
            const originalSrc = img.dataset.scOriginalSrc;

            // 4. 去配置里查：这个原始 URL 对应的配置是什么？
            // 注意：这里我们需要稍微修改 Settings.getReplacementUrl 让他接受 originalSrc
            const newUrl = Settings.getReplacementUrl(originalSrc);

            // 5. 执行替换或还原逻辑
            if (newUrl) {
                // 情况A: 用户启用了替换，且有目标图
                // 只有当当前 src 不等于新 url 时才赋值（避免重复刷新闪烁）
                if (img.src !== newUrl) {
                    img.src = newUrl;
                    img.dataset.scReplaced = 'true'; // 标记已被替换
                }
            } else {
                // 情况B: 用户没启用，或者禁用了
                // 如果之前被替换过 (scReplaced 为 true)，现在需要还原
                if (img.dataset.scReplaced === 'true') {
                    img.src = originalSrc; // 还原回原始地址
                    img.dataset.scReplaced = 'false'; // 标记未被替换
                }
            }
        },

        processBgString(originalBgStr) {
            if (!originalBgStr || originalBgStr === 'none') return null;

            // 关键：剥离可能存在的 !important，否则 join 后会变成 url(...) !important, url(...)
            const cleanBg = originalBgStr.replace(/\s*!important/g, '').trim();
            const parts = cleanBg.split(/,(?=(?:(?:[^"']*["']){2})*[^"']*$)/).map(s => s.trim());

            let hasChanged = false;
            const newParts = parts.map(part => {
                const urlMatch = part.match(/url\(['"]?([^'"]+)['"]?\)/);
                if (urlMatch && urlMatch[1]) {
                    const oldUrl = urlMatch[1];
                    const newUrl = Settings.getReplacementUrl(oldUrl);
                    if (newUrl) {
                        hasChanged = true;
                        return `url("${newUrl}")`;
                    }
                }
                return part;
            });

            return hasChanged ? newParts.join(', ') : null;
        },

        processElementStyle(el) {
            const style = el.style;
            if (!style || !style.backgroundImage) return;

            // 使用 dataset 记录最初的状态
            if (!el.dataset.scOriginalBg) {
                el.dataset.scOriginalBg = style.backgroundImage;
            }

            const newBg = this.processBgString(el.dataset.scOriginalBg);
            if (newBg) {
                // 统一添加 !important 确保覆盖游戏原生样式
                style.setProperty('background-image', newBg, 'important');
            } else if (el.dataset.scOriginalBg) {
                // 如果没有匹配到替换，且当前已经被改动过，则还原
                style.setProperty('background-image', el.dataset.scOriginalBg);
            }
        },

        processStyleSheets() {
            for (const sheet of document.styleSheets) {
                try {
                    if (sheet.href && !sheet.href.startsWith(location.origin)) continue;
                    const rules = sheet.cssRules || sheet.rules;
                    if (!rules) continue;

                    for (const rule of rules) {
                        if (rule.style && rule.style.backgroundImage) {
                            const newBg = this.processBgString(rule.style.backgroundImage);
                            if (newBg) {
                                rule.style.setProperty('background-image', newBg, 'important');
                            }
                        }
                    }
                } catch (e) { /* 忽略跨域错误 */ }
            }
        }
    };


    // ==========================================
    // 5. SCobgUIManager (来自 oldBuildingsGraphic1)
    // ==========================================
    const SCobgUIManager = {
        panel: null,

        init() {
            if (document.getElementById('scobg-panel')) return;
            this.injectCSS();
            this.createPanel();
            this.registerTampermonkeyMenu();

            const win = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
            win.SCobg_TogglePanel = () => this.togglePanel();
        },

        registerTampermonkeyMenu() {
            if (typeof GM_registerMenuCommand !== 'undefined') {
                GM_registerMenuCommand("🎨 皮肤管理面板", () => this.togglePanel());
            }
        },

        togglePanel() {
            if (!this.panel) return;
            const isVisible = this.panel.style.display === 'flex';
            this.panel.style.display = isVisible ? 'none' : 'flex';
            // 锁定背景滚动
            document.body.style.overflow = isVisible ? '' : 'hidden';
        },

        injectCSS() {
            const style = document.createElement('style');
            style.id = 'scobg-ui-style';
            style.textContent = `
                /* 全局盒模型重置 */
                #scobg-panel, #scobg-panel * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
    
                #scobg-panel { 
                    position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); 
                    width: 95vw; max-width: 850px; height: 85vh; max-height: 650px;
                    background: #1a1e26; border: 1px solid #444; z-index: 100000; 
                    color: #fff; display: none; flex-direction: column; 
                    border-radius: 12px; font-family: -apple-system, system-ui, sans-serif; 
                    box-shadow: 0 20px 60px rgba(0,0,0,0.8); overflow: hidden; 
                }
    
                /* 头部样式 */
                .scobg-header { 
                    padding: 0 15px; height: 50px; flex-shrink: 0;
                    border-bottom: 1px solid #2a2f3a; display: flex; 
                    justify-content: space-between; align-items: center; 
                    background: #21262e; 
                }
    
                /* 主体响应式布局 */
                .scobg-body { display: flex; flex: 1; overflow: hidden; }
    
                /* 侧边栏：PC宽，手机窄 */
                .scobg-sidebar { 
                    width: 240px; background: #14171d; border-right: 1px solid #2a2f3a; 
                    overflow-y: auto; flex-shrink: 0;
                }
    
                /* 内容区 */
                .scobg-content { flex: 1; overflow-y: auto; background: #1a1e26; position: relative; }
    
                /* 手机端适配逻辑 (iPhone SE 核心修复) */
                @media screen and (max-width: 768px) {
                    #scobg-panel { width: 100vw; height: 100vh; max-height: 100vh; top: 0; left: 0; transform: none; border-radius: 0; }
                    .scobg-body { flex-direction: column; }
                    
                    /* 手机端侧边栏占用上半部分，增加滚动流畅度 */
                    .scobg-sidebar { 
                        width: 100%; height: 40%; border-right: none; 
                        border-bottom: 1px solid #2a2f3a; -webkit-overflow-scrolling: touch; 
                    }
                    .scobg-content { height: 60%; -webkit-overflow-scrolling: touch; }
    
                    /* 列表项改为垂直堆叠 */
                    .scobg-row { 
                        flex-direction: column !important; align-items: flex-start !important; gap: 12px !important; 
                        padding: 12px !important;
                    }
                    .scobg-imgs { width: 100%; justify-content: space-between; }
                    .scobg-info { width: 100%; }
                    
                    /* 按钮在手机上更大更易点 */
                    .scobg-btn-blue { padding: 8px 16px; font-size: 13px; }
                }
    
                /* 树形菜单细节 */
                .scobg-tree-item { 
                    cursor: pointer; padding: 12px 15px; color: #aaa; 
                    font-size: 14px; border-bottom: 1px solid rgba(255,255,255,0.02);
                    display: flex; align-items: center;
                }
                .scobg-l1 { font-weight: bold; background: #1c2129; color: #eee; }
                .scobg-l2 { padding-left: 25px; font-size: 13px; background: #11151a; }
                .scobg-l3 { padding-left: 45px; font-size: 13px; }
                .scobg-l3.active { color: #2196f3; background: rgba(33,150,243,0.1); border-left: 4px solid #2196f3; }
                
                .scobg-sub-container { display: none; }
                .scobg-sub-container.show { display: block; }
                .scobg-arrow { font-size: 10px; margin-right: 10px; transition: 0.2s; opacity: 0.5; }
    
                /* 皮肤项卡片 */
                .scobg-grid { padding: 12px; }
                .scobg-row { 
                    background: #252a35; padding: 15px; margin-bottom: 12px; 
                    border-radius: 8px; border: 1px solid #333; 
                    display: flex; align-items: center; justify-content: space-between; 
                }
                .scobg-name { font-size: 15px; font-weight: bold; margin-bottom: 6px; color: #fff; }
                .scobg-check { display: flex; align-items: center; gap: 8px; font-size: 13px; color: #888; cursor: pointer; }
                .scobg-check input { width: 18px; height: 18px; cursor: pointer; }
    
                /* 图片预览区 */
                .scobg-imgs { display: flex; align-items: center; gap: 12px; }
                .scobg-ui-img { 
                    width: 90px; height: 60px; object-fit: contain; 
                    background: #000; border: 1px solid #444; border-radius: 6px; 
                }
                .scobg-ui-img.click { border-color: #555; cursor: pointer; }
    
                /* 响应式弹窗菜单 (iPhone SE 适配核心) */
                .scobg-menu { 
                    position: fixed; background: #2c323d; border: 1px solid #555; 
                    border-radius: 12px; z-index: 100001; padding: 12px; 
                    width: 90vw; max-width: 320px; box-sizing: border-box;
                    display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; 
                    box-shadow: 0 15px 50px rgba(0,0,0,0.7);
                }
                .scobg-menu-item { text-align: center; cursor: pointer; }
                .scobg-menu-item img { width: 100%; height: 50px; object-fit: contain; background: #000; border-radius: 4px; }
                .scobg-menu-item span { font-size: 11px; color: #bbb; display: block; margin-top: 5px; }
    
                .scobg-btn-blue { background: #2196f3; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold; }
            `;
            document.head.appendChild(style);
        },

        createPanel() {
            this.panel = document.createElement('div');
            this.panel.id = 'scobg-panel';
            this.panel.innerHTML = `
                <div class="scobg-header">
                    <span style="font-size:15px; font-weight:bold; letter-spacing:0.5px;">SC皮肤管理 <a href="https://showscimg.22-7.top/images" target="_blank" style="margin-left:8px; font-size:13px; color:#3498db; text-decoration:underline;">SC图片一览</a></span>
                    <div style="display:flex; gap:10px; align-items:center;">
                        
                        <button id="scobg-import-btn" class="scobg-btn-blue" style="background:#e67e22; padding:5px 12px;">导入配置</button>
                        <input type="file" id="scobg-import-file" accept=".json" style="display:none;">
                        <button id="scobg-export" class="scobg-btn-blue" style="background:#d35400; padding:5px 12px;">导出配置</button>
                        
                        <button id="scobg-save" class="scobg-btn-blue" style="background:#2ecc71; padding:5px 12px;">保存</button>
                        <button id="scobg-apply" class="scobg-btn-blue" style="padding:5px 12px;">刷新</button>
                        <div id="scobg-close" style="padding:5px; cursor:pointer; font-size:22px; color:#777;">✕</div>
                    </div>
                </div>
                <div class="scobg-body">
                    <div class="scobg-sidebar"></div>
                    <div class="scobg-content">
                        <div style="height:100%; display:flex; align-items:center; justify-content:center; color:#555; flex-direction:column; gap:10px;">
                            <span style="font-size:40px;">🎨</span>
                            <span>请在${window.innerWidth < 768 ? '上方' : '左侧'}选择分类</span>
                        </div>
                    </div>
                </div>
            `;
            document.body.appendChild(this.panel);

            // 绑定基础事件
            this.panel.querySelector('#scobg-close').onclick = () => this.togglePanel();
            this.panel.querySelector('#scobg-apply').onclick = () => location.reload();
            this.panel.querySelector('#scobg-save').onclick = (e) => {
                if (typeof Settings !== 'undefined') {
                    Settings.save();
                    const btn = e.target;
                    const oldText = btn.textContent;
                    btn.textContent = '已存';
                    setTimeout(() => btn.textContent = oldText, 1500);
                }
            };

            // =====================================
            // 新增事件绑定：强制更新
            // =====================================
            // this.panel.querySelector('#scobg-force-update').onclick = () => {
            //     const btn = this.panel.querySelector('#scobg-force-update');
            //     btn.textContent = '更新中...';
            //     ConfigManager.forceUpdateRemoteData().finally(() => {
            //         btn.textContent = '强制更新数据';
            //     });
            // };

            // =====================================
            // 新增事件绑定：导出用户配置
            // =====================================
            this.panel.querySelector('#scobg-export').onclick = () => {
                const dataStr = JSON.stringify(Settings.data, null, 2);
                const blob = new Blob([dataStr], { type: "application/json" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `sc_skin_backup_${new Date().toISOString().slice(0, 10)}.json`;
                a.click();
                URL.revokeObjectURL(url);
            };

            // =====================================
            // 新增事件绑定：导入用户配置
            // =====================================
            const importInput = this.panel.querySelector('#scobg-import-file');
            this.panel.querySelector('#scobg-import-btn').onclick = () => importInput.click();
            importInput.onchange = (e) => {
                const file = e.target.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = (ev) => {
                    try {
                        const importedData = JSON.parse(ev.target.result);
                        Settings.data = importedData;
                        Settings.save();
                        alert('✅ 皮肤配置导入成功！页面即将刷新。');
                        location.reload();
                    } catch (err) {
                        alert('❌ 导入失败，文件格式不正确，请确保是之前导出的 JSON 文件！');
                    }
                };
                reader.readAsText(file);
                // 清空 input，允许重复导入同一个文件
                e.target.value = '';
            };

            this.renderSidebar();
        },

        renderSidebar() {
            const sidebar = this.panel.querySelector('.scobg-sidebar');
            if (!sidebar || typeof UI_MANIFEST === 'undefined') return;
            sidebar.innerHTML = '';

            for (const [l1Name, l1Data] of Object.entries(UI_MANIFEST)) {
                const l1El = this.createTreeItem(l1Name, 'scobg-l1');
                const l1Container = document.createElement('div');
                l1Container.className = 'scobg-sub-container';

                l1El.onclick = () => this.toggleTree(l1El, l1Container);

                for (const [l2Name, l2Data] of Object.entries(l1Data)) {
                    const l2El = this.createTreeItem(l2Name, 'scobg-l2');
                    const l2Container = document.createElement('div');
                    l2Container.className = 'scobg-sub-container';

                    l2El.onclick = (e) => {
                        e.stopPropagation();
                        this.toggleTree(l2El, l2Container);
                    };

                    for (const [l3Name, l3Items] of Object.entries(l2Data)) {
                        const l3El = document.createElement('div');
                        l3El.className = 'scobg-tree-item scobg-l3';
                        l3El.textContent = l3Name;
                        l3El.onclick = (e) => {
                            e.stopPropagation();
                            sidebar.querySelectorAll('.scobg-l3').forEach(el => el.classList.remove('active'));
                            l3El.classList.add('active');
                            this.renderContent(l1Name, l2Name, l3Name, l3Items);
                            // 手机端点击后自动滚动到内容区
                            if (window.innerWidth <= 768) {
                                this.panel.querySelector('.scobg-content').scrollIntoView({ behavior: 'smooth' });
                            }
                        };
                        l2Container.appendChild(l3El);
                    }
                    l1Container.appendChild(l2El);
                    l1Container.appendChild(l2Container);
                }
                sidebar.appendChild(l1El);
                sidebar.appendChild(l1Container);
            }
        },

        createTreeItem(text, className) {
            const div = document.createElement('div');
            div.className = `scobg-tree-item ${className}`;
            div.innerHTML = `<span class="scobg-arrow">▶</span> ${text}`;
            return div;
        },

        toggleTree(el, container) {
            const isShow = container.classList.toggle('show');
            const arrow = el.querySelector('.scobg-arrow');
            if (arrow) arrow.style.transform = isShow ? 'rotate(90deg)' : 'rotate(0deg)';
        },

        renderContent(l1, l2, l3, items) {
            const content = this.panel.querySelector('.scobg-content');
            content.innerHTML = `
                <div style="padding:15px; border-bottom:1px solid #333; position:sticky; top:0; background:rgba(26,30,38,0.95); z-index:10; backdrop-filter:blur(4px);">
                    <div style="font-size:11px; color:#666; margin-bottom:2px;">${l1} > ${l2}</div>
                    <div style="font-size:17px; font-weight:bold;">${l3}</div>
                </div>
                <div class="scobg-grid"></div>
            `;
            const grid = content.querySelector('.scobg-grid');
            for (const [key, meta] of Object.entries(items)) {
                this.renderRow(grid, key, meta, () => this.renderContent(l1, l2, l3, items));
            }
        },

        renderRow(container, key, meta, refresh) {
            const cfg = (typeof Settings !== 'undefined' && Settings.data[key]) || { enabled: false, target: "" };
            const relPath = (typeof PATH_MAP !== 'undefined' && PATH_MAP[key]) || `images/${key}`;
            const originalUrl = `${(typeof CONSTANTS !== 'undefined' ? CONSTANTS.STATIC_ROOT : '')}${relPath}`;

            const row = document.createElement('div');
            row.className = 'scobg-row';
            row.innerHTML = `
                <div class="scobg-info">
                    <div class="scobg-name">${meta.name}</div>
                    <label class="scobg-check">
                        <input type="checkbox" ${cfg.enabled ? 'checked' : ''}>
                        <span>使用自定义皮肤</span>
                    </label>
                </div>
                <div class="scobg-imgs">
                    <div style="text-align:center"><div style="font-size:9px;color:#555;margin-bottom:2px">原图</div><img src="${originalUrl}" class="scobg-ui-img" style="opacity:0.2;filter:grayscale(1)"></div>
                    <div style="color:#333;font-size:12px">➔</div>
                    <div style="text-align:center"><div style="font-size:9px;color:#2196f3;margin-bottom:2px">当前</div><img src="${cfg.target || originalUrl}" class="scobg-ui-img click select-trigger" style="border-color:${cfg.enabled ? '#2196f3' : '#444'}"></div>
                </div>
            `;

            row.querySelector('input').onchange = (e) => this.update(key, cfg.target, e.target.checked, refresh);
            row.querySelector('.select-trigger').onclick = (e) => this.showMenu(e, meta, (url) => this.update(key, url, true, refresh));
            container.appendChild(row);
        },

        showMenu(e, meta, onSelect) {
            const old = document.querySelector('.scobg-menu'); if (old) old.remove();
            const menu = document.createElement('div');
            menu.className = 'scobg-menu';

            // 手机端居中策略
            if (window.innerWidth <= 768) {
                menu.style.left = '50%';
                menu.style.top = '50%';
                menu.style.transform = 'translate(-50%, -50%)';
            } else {
                menu.style.left = `${Math.min(e.clientX, window.innerWidth - 330)}px`;
                menu.style.top = `${Math.min(e.clientY, window.innerHeight - 350)}px`;
            }

            if (meta.presets) {
                meta.presets.forEach(p => {
                    const item = document.createElement('div');
                    item.className = 'scobg-menu-item';
                    item.innerHTML = `<img src="${p.url}"><span>${p.name}</span>`;
                    item.onclick = (ev) => { ev.stopPropagation(); onSelect(p.url); menu.remove(); };
                    menu.appendChild(item);
                });
            }

            const foot = document.createElement('div');
            foot.style.cssText = 'grid-column: span 2; display: flex; flex-direction: column; gap: 8px; margin-top: 5px; border-top: 1px solid #444; padding-top: 10px;';
            foot.innerHTML = `
                <div style="display:flex; gap:6px;">
                    <input type="text" placeholder="输入链接..." style="flex:1; width:0; background:#111; border:1px solid #555; color:#fff; padding:10px; border-radius:6px; font-size:13px; outline:none;">
                    <button class="scobg-btn-blue" style="padding:0 15px;">确定</button>
                </div>
            `;

            const input = foot.querySelector('input');
            const btn = foot.querySelector('button');
            const confirm = () => { if (input.value) { onSelect(input.value); menu.remove(); } };

            btn.onclick = (ev) => { ev.stopPropagation(); confirm(); };
            input.onclick = (ev) => ev.stopPropagation();
            input.onkeydown = (ev) => { if (ev.key === 'Enter') confirm(); };

            menu.appendChild(foot);
            document.body.appendChild(menu);

            setTimeout(() => {
                const outClick = (ev) => {
                    if (!menu.contains(ev.target)) { menu.remove(); document.removeEventListener('click', outClick); }
                };
                document.addEventListener('click', outClick);
            }, 50);
        },

        update(key, url, enabled, refresh) {
            if (typeof Settings !== 'undefined') {
                Settings.data[key] = { target: url, enabled: enabled };
                Settings.save();
            }
            if (refresh) refresh();
            if (typeof Scheduler !== 'undefined') Scheduler.scanAll();
            if (typeof StyleManager !== 'undefined') StyleManager.updateTheme();
        }
    };

    // ==========================================
    // 6. 调度器与监听
    // ==========================================
    const Scheduler = {
        timer: null,
        run() {
            if (this.timer) return;
            this.timer = setTimeout(() => {
                this.scanAll();
                this.timer = null;
            }, 100);
        },
        scanAll() {
            document.querySelectorAll('img').forEach(img => DOMProcessor.processImg(img));
            document.querySelectorAll('[style*="background-image"]').forEach(div => DOMProcessor.processElementStyle(div));
            DOMProcessor.processStyleSheets();
            StyleManager.updateTheme();
        }
    };

    const observer = new MutationObserver(() => Scheduler.run());


    // ==========================================
    // 7. 网络请求 Hook (监听主题变化)
    // ==========================================
    const NetworkHook = {
        init() {
            const AUTH_URL_PART = '/api/v3/companies/auth-data/';
            const handleAuthData = (data) => {
                if (data?.preferences?.theme) {
                    const newTheme = data.preferences.theme;
                    if (localStorage.getItem(CONSTANTS.THEME_KEY) !== newTheme) {
                        localStorage.setItem(CONSTANTS.THEME_KEY, newTheme);
                        StyleManager.updateTheme();
                    }
                }
            };

            const originalFetch = window.fetch;
            window.fetch = async (...args) => {
                const response = await originalFetch(...args);
                try {
                    if (typeof args[0] === 'string' && args[0].includes(AUTH_URL_PART)) {
                        response.clone().json().then(handleAuthData).catch(() => { });
                    }
                } catch { }
                return response;
            };

            const originalXHR = window.XMLHttpRequest.prototype.open;
            window.XMLHttpRequest.prototype.open = function (method, url) {
                this.addEventListener('load', function () {
                    if (url && url.includes(AUTH_URL_PART) && this.responseText) {
                        try { handleAuthData(JSON.parse(this.responseText)); } catch { }
                    }
                });
                return originalXHR.apply(this, arguments);
            };
            console.log('[SC-Skin] 网络监听已启动');
        }
    };


    // ==========================================
    // 8. 版本更新检查模块
    // ==========================================
    const UpdateChecker = {
        init() {
            // 延迟执行，避免影响页面主要内容加载
            setTimeout(() => this.checkUpdate(), 5000);
        },

        compareVersions(v1, v2) {
            const a = v1.split('.').map(Number);
            const b = v2.split('.').map(Number);
            const len = Math.max(a.length, b.length);
            for (let i = 0; i < len; i++) {
                const num1 = a[i] || 0;
                const num2 = b[i] || 0;
                if (num1 > num2) return 1;
                if (num1 < num2) return -1;
            }
            return 0;
        },

        showUpdateToast(version, changelog, downloadUrl) {
            // 1. 注入样式
            const style = document.createElement('style');
            style.textContent = `
                .sc-update-toast {
                    position: fixed; top: -80px; left: 50%; transform: translateX(-50%);
                    z-index: 10001; background: #2196F3; color: white;
                    padding: 10px 20px; border-radius: 50px; cursor: pointer;
                    box-shadow: 0 4px 15px rgba(0,0,0,0.2);
                    transition: all 0.4s cubic-bezier(0.165, 0.84, 0.44, 1);
                    max-width: 90vw; width: max-content;
                    font-family: sans-serif; box-sizing: border-box;
                }
                .sc-update-toast.show { top: 20px; }
                
                /* 展开后的卡片样式 */
                .sc-update-toast.expanded {
                    border-radius: 12px; padding: 20px; width: 400px;
                    background: #ffffff; color: #333; cursor: default;
                    border-top: 5px solid #2196F3;
                }
                
                .sc-update-header {
                    margin: 0; font-size: 14px; font-weight: bold;
                    display: flex; align-items: center; justify-content: center; gap: 8px;
                }
                .sc-update-toast.expanded .sc-update-header {
                    color: #2196F3; font-size: 18px; justify-content: flex-start;
                }
    
                /* 右上角关闭按钮 */
                .sc-update-close {
                    position: absolute; top: 10px; right: 12px;
                    display: none; cursor: pointer; font-size: 20px; color: #999;
                    line-height: 1; padding: 5px;
                }
                .sc-update-toast.expanded .sc-update-close { display: block; }
                .sc-update-close:hover { color: #333; }
    
                /* 内容区域 */
                .sc-update-body {
                    max-height: 0; opacity: 0; transition: all 0.3s ease; overflow: hidden;
                }
                .sc-update-toast.expanded .sc-update-body {
                    max-height: 400px; opacity: 1; margin-top: 15px;
                }
    
                .sc-changelog-box {
                    background: #f5f7f9; padding: 12px; border-radius: 6px;
                    margin: 10px 0; color: #555; font-size: 13px;
                    border-left: 3px solid #ddd; max-height: 150px; overflow-y: auto;
                }
    
                /* 底部按钮区域 */
                .sc-update-actions {
                    display: flex; justify-content: space-between; align-items: center; margin-top: 20px;
                }
                .sc-btn { padding: 8px 16px; border-radius: 6px; border: none; cursor: pointer; font-size: 12px; font-weight: bold; }
                .sc-btn-primary { background: #2196F3; color: white; }
                .sc-btn-link { background: transparent; color: #999; text-decoration: underline; padding: 8px 0; }
                .sc-btn-link:hover { color: #666; }
            `;
            document.head.appendChild(style);

            // 2. HTML 结构
            const toast = document.createElement('div');
            toast.className = 'sc-update-toast';
            toast.innerHTML = `
                <div class="sc-update-close" id="sc-close" title="暂时关闭">&times;</div>
                <div class="sc-update-header" id="sc-title">SC图片替换插件 发现新版本 v${version} (点击查看)</div>
                <div class="sc-update-body">
                    <p style="margin:0; font-weight:bold;">更新日志：</p>
                    <div class="sc-changelog-box">${changelog.replace(/\n/g, '<br>') || '修复已知问题，优化性能。'}</div>
                    <p style="font-size: 11px; color: #999; margin: 10px 0;">
                        提示：忽略后将不再提示此版本。
                    </p>
                    <div class="sc-update-actions">
                        <button class="sc-btn sc-btn-link" id="sc-ignore-forever">忽略此次更新</button>
                        <button class="sc-btn sc-btn-primary" id="sc-confirm">前往更新</button>
                    </div>
                </div>
            `;
            document.body.appendChild(toast);

            // 3. 入场
            setTimeout(() => toast.classList.add('show'), 100);

            // 4. 交互逻辑

            // 点击展开
            toast.onclick = (e) => {
                if (!toast.classList.contains('expanded')) {
                    toast.classList.add('expanded');
                    document.getElementById('sc-title').innerHTML = `SC图片替换插件 发现新版本 v${version}`;
                }
            };

            // 右上角关闭：仅仅是本次消失
            document.getElementById('sc-close').onclick = (e) => {
                e.stopPropagation();
                toast.classList.remove('show');
                setTimeout(() => toast.remove(), 400);
            };

            // 左下角：忽略此版本
            document.getElementById('sc-ignore-forever').onclick = (e) => {
                e.stopPropagation();
                localStorage.setItem('sc_ignored_version', version);
                toast.classList.remove('show');
                setTimeout(() => toast.remove(), 400);
            };

            // 右下角：去更新
            document.getElementById('sc-confirm').onclick = (e) => {
                e.stopPropagation();
                window.open(downloadUrl, '_blank');
                toast.classList.remove('show');
                setTimeout(() => toast.remove(), 400);
            };
        },

        async checkUpdate() {
            const scriptUrl = 'https://sc.22-7.top/scripts/oldBuildingsGraphic.user.js?t=' + Date.now();
            const downloadUrl = 'https://sc.22-7.top/scripts/oldBuildingsGraphic.user.js';
            // @changelog    追加全部物品资源

            fetch(scriptUrl)
                .then(res => res.text())
                .then(remoteText => {
                    const matchVersion = remoteText.match(/^\s*\/\/\s*@version\s+([0-9.]+)/m);
                    const matchChange = remoteText.match(/^\s*\/\/\s*@changelog\s+(.+)/m);
                    if (!matchVersion) return;

                    latestVersion = matchVersion[1]; // 确保全局变量被更新
                    const changeLog = matchChange ? matchChange[1] : '';

                    // 1. 首先进行版本比较
                    const isNewer = this.compareVersions(latestVersion, localVersion) > 0;

                    // 2. 只有确实有新版本时，才将 hasNewVersion 设为 true
                    if (isNewer) {
                        hasNewVersion = true; // 恢复你的原有逻辑
                        console.log(`SC图片替换插件 发现新版本 v${latestVersion}`);

                        // 3. 检查是否被用户手动忽略过
                        const ignoredVersion = localStorage.getItem('sc_ignored_version');
                        if (ignoredVersion && this.compareVersions(ignoredVersion, latestVersion) >= 0) {
                            console.log(`[Update] 用户已忽略此版本，不弹出 UI 提示`);
                            return;
                        }

                        // 4. 如果没有被忽略，则弹出 UI 提示
                        this.showUpdateToast(latestVersion, changeLog, downloadUrl);
                    } else {
                        hasNewVersion = false;
                        console.log("✅ 当前已是最新版本");
                    }
                })
                .catch(err => {
                    console.error('检查更新失败', err);
                    hasNewVersion = false; // 失败时默认为 false
                });
        }
    };


    // ==========================================
    // 9. 启动 & 全局暴露
    // ==========================================
    function main() {
        ConfigManager.init(); // 1. 先读取本地缓存的最新的 UI_MANIFEST (如果有)
        Settings.init();      // 2. 初始化用户个人设置 (这步会遍历 UI_MANIFEST)
        StyleManager.init();
        NetworkHook.init();
        SCobgUIManager.init();
        UpdateChecker.init();

        observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['src', 'style', 'class']
        });

        Scheduler.run();

        window.SC_Skin_Manager = {
            settings: Settings,
            config: ConfigManager, // 暴露给外部调试
            forceRescan: () => Scheduler.scanAll()
        };
    }
    main();

})();
