require('angular');

angular.module('webApp').service('delegateService', function ($http, $filter) {

    function filterData(data, filter) {
        return $filter('filter')(data, filter)
    }

    function orderData(data, params) {
        return params.sorting() ? $filter('orderBy')(data, params.orderBy()) : filteredData;
    }

    function sliceData(data, params) {
        return data.slice((params.page() - 1) * params.count(), params.page() * params.count())
    }

    function transformData(data, filter, params) {
        return sliceData(orderData(filterData(data, filter), params), params);
    }

    var delegates = {
        gettingStandBy: false,
        gettingTop: false,
        gettingVoted: false,
        cachedTOP: {data: [], time: new Date()},
        cachedStundby: {data: [], time: new Date()},
        cachedVotedDelegates: {data: [], time: new Date()},
        getTopList: function ($defer, params, filter) {
            if (!this.gettingTop) {
                this.gettingTop = !this.gettingTop;
            if (delegates.cachedTOP.data.length > 0 && new Date() - delegates.cachedTOP.time < 1000 * 10) {
                var filteredData = filterData(delegates.cachedTOP.data, filter);
                var transformedData = sliceData(orderData(filteredData, params), params);
                params.total(filteredData.length)
                this.gettingTop = !this.gettingTop;
                $defer.resolve(transformedData);
            }
            else {
                $http.get("/api/delegates/", {params: {orderBy: "rate:asc", limit: 3, offset: 0}})
                    .then(function (response) {
                        angular.copy(response.data.delegates, delegates.cachedTOP.data);
                        delegates.cachedTOP.time = new Date();
                        params.total(response.data.delegates.length);
                        var filteredData = $filter('filter')(delegates.cachedTOP.data, filter);
                        var transformedData = transformData(delegates.cachedTOP.data, filter, params);
                        delegates.gettingTop = !delegates.gettingTop;
                        $defer.resolve(transformedData);
                    });
            }
        }},
        getStandbyList: function ($defer, params, filter) {
            if (!this.gettingStandBy) {
                this.gettingStandBy = !this.gettingStandBy;
            if (delegates.cachedStundby.data.length > 0 && new Date() - delegates.cachedStundby.time < 1000 * 10) {
                var filteredData = filterData(delegates.cachedStundby.data, filter);
                var transformedData = sliceData(orderData(filteredData, params), params);
                params.total(filteredData.length);
                this.gettingStandBy = !this.gettingStandBy;
                $defer.resolve(transformedData);
            }
            else {
                this.cachedStundby.data = [];
                var getPart = function (limit, offset) {
                    $http.get("/api/delegates/", {params: {orderBy: "rate:asc", limit: limit, offset: offset}})
                        .then(function (response) {
                            if (response.data.delegates.length > 0) {
                                delegates.cachedStundby.data = delegates.cachedStundby.data.concat(response.data.delegates);
                                getPart(limit, limit + offset);
                            }
                            else {
                                delegates.cachedStundby.time = new Date();
                                params.total(delegates.cachedStundby.data.length);
                                var filteredData = $filter('filter')(delegates.cachedStundby.data, filter);
                                var transformedData = transformData(delegates.cachedStundby.data, filter, params)
                                delegates.gettingStandBy = !delegates.gettingStandBy;
                                $defer.resolve(transformedData);
                            }
                        });
                };
                getPart(1, 3);
            }
        }},
        getMyDelegates: function($defer, params, filter){
            if (!this.gettingVoted) {
                this.gettingVoted = !this.gettingVoted;
                if (delegates.cachedVotedDelegates.data.length > 0 && new Date() - delegates.cachedVotedDelegates.time < 1000 * 10) {
                    var filteredData = filterData(delegates.cachedVotedDelegates.data, filter);
                    var transformedData = sliceData(orderData(filteredData, params), params);
                    params.total(filteredData.length);
                    this.gettingVoted = !this.gettingVoted;
                    $defer.resolve(transformedData);
                }
                else {
                    this.cachedVotedDelegates.data = [];
                    var getPart = function (limit, offset) {
                        $http.get("/api/delegates/", {params: {orderBy: "rate:asc", limit: limit, offset: offset}})
                            .then(function (response) {
                                if (response.data.delegates.length > 0) {
                                    delegates.cachedStundby.data = delegates.cachedStundby.data.concat(response.data.delegates);
                                    getPart(limit, limit + offset);
                                }
                                else {
                                    delegates.cachedStundby.time = new Date();
                                    params.total(delegates.cachedStundby.data.length);
                                    var filteredData = $filter('filter')(delegates.cachedStundby.data, filter);
                                    var transformedData = transformData(delegates.cachedStundby.data, filter, params)
                                    delegates.gettingVoted = !delegates.gettingVoted;
                                    $defer.resolve(transformedData);
                                }
                            });
                    };
                    getPart(1, 3);
                }
            }
        }
    };
    return delegates;
});