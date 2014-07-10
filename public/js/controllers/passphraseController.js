webApp.controller('passphraseController', ['$scope', '$rootScope', '$http', "$state", "userService",
    function($rootScope, $scope, $http, $state, userService) {
        $scope.login = function(pass) {
            if (!pass || pass.length > 100){
            }
            else{
                $http.get("/api/unlock", { params : { secretPhrase : pass }})
                    .then(function (resp) {
                        if (resp.data.success) {
                            userService.setData(resp.data.address, resp.data.publickey, resp.data.balance, resp.data.unconfirmedBalance, resp.data.effectiveBalance);
                            userService.setForging(resp.data.forging);

                            $state.go('main.account');
                        } else {
                            alert("Something wrong. Restart server please.");
                        }
                    });
            }
        }
}]);