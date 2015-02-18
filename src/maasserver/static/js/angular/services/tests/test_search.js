/* Copyright 2015 Canonical Ltd.  This software is licensed under the
 * GNU Affero General Public License version 3 (see the file LICENSE).
 *
 * Unit tests for SearchService.
 */

describe("SearchService", function() {

    // Load the MAAS module.
    beforeEach(module("MAAS"));

    // Load the SearchService.
    var SearchService;
    beforeEach(inject(function($injector) {
        SearchService = $injector.get("SearchService");
    }));

    var scenarios = [
        {
            input: "",
            split: [""],
            filters: {
                _: []
            }
        },
        {
            input: "moon",
            split: ["moon"],
            filters: {
                _: ["moon"]
            }
        },
        {
            input: "moon status:(new)",
            split: ["moon", "status:(new)"],
            filters: {
                _: ["moon"],
                status: ["new"]
            }
        },
        {
            input: "moon status:(deployed)",
            split: ["moon", "status:(deployed)"],
            filters: {
                _: ["moon"],
                status: ["deployed"]
            }
        },
        {
            input: "moon status:(new,deployed)",
            split: ["moon", "status:(new,deployed)"],
            filters: {
                _: ["moon"],
                status: ["new", "deployed"]
            }
        },
        {
            input: "moon status:(new,failed disk erasing)",
            split: ["moon", "status:(new,failed disk erasing)"],
            filters: {
                _: ["moon"],
                status: ["new", "failed disk erasing"]
            }
        },
        {
            input: "moon status:(new,failed disk erasing",
            split: null,
            filters: null
        }
    ];

    angular.forEach(scenarios, function(scenario) {
        describe("input:" + scenario.input, function() {

            it("getSplitSearch", function() {
                expect(SearchService.getSplitSearch(
                    scenario.input)).toEqual(scenario.split);
            });

            it("getCurrentFilters", function() {
                expect(SearchService.getCurrentFilters(
                    scenario.input)).toEqual(scenario.filters);
            });

            it("filtersToString", function() {
                // Skip the ones with filters equal to null.
                if(!scenario.filters) {
                    return;
                }

                expect(SearchService.filtersToString(
                    scenario.filters)).toEqual(scenario.input);
            });
        });
    });

    describe("isFilterActive", function() {

        it("returns false if type not in filter", function() {
            expect(SearchService.isFilterActive(
                {}, "type", "invalid")).toBe(false);
        });

        it("returns false if value not in type", function() {
            expect(SearchService.isFilterActive(
                {
                    type: ["not"]
                }, "type", "invalid")).toBe(false);
        });

        it("returns true if value in type", function() {
            expect(SearchService.isFilterActive(
                {
                    type: ["valid"]
                }, "type", "valid")).toBe(true);
        });
    });

    describe("toggleFilter", function() {

        it("adds type to filters", function() {
            expect(SearchService.toggleFilter(
                {}, "type", "value")).toEqual({
                    type: ["value"]
                });
        });

        it("adds value to type in filters", function() {
            var filters = {
                type: ["exists"]
            };
            expect(SearchService.toggleFilter(
                filters, "type", "value")).toEqual({
                    type: ["exists", "value"]
                });
        });

        it("removes value to type in filters", function() {
            var filters = {
                type: ["exists", "value"]
            };
            expect(SearchService.toggleFilter(
                filters, "type", "value")).toEqual({
                    type: ["exists"]
                });
        });
    });

    describe("emptyFilter", function() {

        it("includes _ empty list", function() {
            expect(SearchService.emptyFilter).toEqual({ _: [] });
        });
    });
});
