sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/core/routing/History",
    "sap/ui/core/format/NumberFormat",
    "sap/m/MessageToast"
], function (Controller, History, NumberFormat, MessageToast) {
    "use strict";

    return Controller.extend("com.example.customeranalytics.customersalesanalytics.controller.CustomerDetail", {

        onInit: function () {
            this._oAmountFormat = NumberFormat.getFloatInstance({
                maxFractionDigits: 2,
                groupingEnabled: true
            });
            this.getOwnerComponent().getRouter()
                .getRoute("RouteCustomerDetail")
                .attachPatternMatched(this._onRouteMatched, this);
        },

        // Mỗi lần mở /customers/{customerId}: bind cả trang vào 1 khách hàng
        _onRouteMatched: function (oEvent) {
            var sId = oEvent.getParameter("arguments").customerId;
            var oModel = this.getOwnerComponent().getModel();

            oModel.metadataLoaded().then(function () {
                // Tạo đường dẫn dạng /ZC324_PROJECT2('0000001000')
                var sPath = oModel.createKey("/ZC324_PROJECT2", { CustomerNumber: sId });

                this.getView().bindElement({
                    path: sPath,
                    events: {
                        dataReceived: function (oEv) {
                            if (!oEv.getParameter("data")) {
                                MessageToast.show("Không tìm thấy khách hàng " + sId);
                            }
                        }
                    }
                });
            }.bind(this));
        },

        // Hiện số đơn trên tiêu đề bảng lịch sử
        onOrdersUpdated: function (oEvent) {
            var iTotal = oEvent.getParameter("total");
            this.byId("orderTitle").setText("Lịch sử đơn hàng (" + iTotal + ")");
        },

        onNavBack: function () {
            if (History.getInstance().getPreviousHash() !== undefined) {
                window.history.go(-1);
            } else {
                this.getOwnerComponent().getRouter().navTo("RouteCustomerList", {}, true);
            }
        },

        formatAmount: function (v) {
            return this._oAmountFormat.format(parseFloat(v) || 0);
        }
    });
});