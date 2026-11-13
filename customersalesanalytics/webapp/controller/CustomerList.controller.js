sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/ui/core/routing/History",
    "sap/ui/core/format/NumberFormat"
], function (Controller, JSONModel, Filter, FilterOperator, History, NumberFormat) {
    "use strict";

    return Controller.extend("com.example.customeranalytics.customersalesanalytics.controller.CustomerList", {

        onInit: function () {
            this._oAmountFormat = NumberFormat.getFloatInstance({
                maxFractionDigits: 2,
                groupingEnabled: true
            });
            this.getView().setModel(new JSONModel({ countries: [] }), "lf");
            this._loadCountries();
        },

        // Lấy danh sách quốc gia cho ComboBox
        _loadCountries: function () {
            var oLf = this.getView().getModel("lf");
            this.getOwnerComponent().getModel().read("/ZC324_PROJECT2", {
                urlParameters: { "$select": "Country" },
                success: function (oData) {
                    var mSeen = {};
                    (oData.results || []).forEach(function (o) {
                        if (o.Country) {
                            mSeen[o.Country] = true;
                        }
                    });
                    oLf.setProperty("/countries", Object.keys(mSeen).sort().map(function (k) {
                        return { key: k, text: k };
                    }));
                }
            });
        },

        // =====================================================
        // LỌC: gửi $filter xuống backend
        // =====================================================
        onApplyFilter: function () {
            var aFilters = [];
            var sQuery = (this.byId("searchField").getValue() || "").trim();
            var sCountry = this.byId("cbCountry").getSelectedKey();
            var sRegion = (this.byId("inRegion").getValue() || "").trim().toUpperCase();
            var bActive = this.byId("cbActive").getSelected();

            if (sQuery) {
                // Tìm theo mã HOẶC tên (tên phân biệt hoa/thường)
                aFilters.push(new Filter({
                    filters: [
                        new Filter("CustomerNumber", FilterOperator.Contains, sQuery.toUpperCase()),
                        new Filter("CustomerName", FilterOperator.Contains, sQuery)
                    ],
                    and: false
                }));
            }
            if (sCountry) {
                aFilters.push(new Filter("Country", FilterOperator.EQ, sCountry));
            }
            if (sRegion) {
                aFilters.push(new Filter("Region", FilterOperator.EQ, sRegion));
            }
            if (bActive) {
                aFilters.push(new Filter("TotalOrders", FilterOperator.GT, 0));
            }

            this.byId("customerTable").getBinding("items").filter(
                aFilters.length ? new Filter({ filters: aFilters, and: true }) : []
            );
        },

        onClearFilter: function () {
            this.byId("searchField").setValue("");
            this.byId("cbCountry").setSelectedKey("");
            this.byId("cbCountry").setValue("");
            this.byId("inRegion").setValue("");
            this.byId("cbActive").setSelected(false);
            this.onApplyFilter();
        },

        // Hiện tổng số dòng trên tiêu đề bảng
        onUpdateFinished: function (oEvent) {
            var iTotal = oEvent.getParameter("total");
            this.byId("tableTitle").setText("Khách hàng (" + iTotal + ")");
        },

        // =====================================================
        // ĐIỀU HƯỚNG
        // =====================================================
        onItemPress: function (oEvent) {
            var sId = oEvent.getSource().getBindingContext().getProperty("CustomerNumber");
            this.getOwnerComponent().getRouter().navTo("RouteCustomerDetail", { customerId: sId });
        },

        onNavBack: function () {
            if (History.getInstance().getPreviousHash() !== undefined) {
                window.history.go(-1);
            } else {
                this.getOwnerComponent().getRouter().navTo("RouteDashboard", {}, true);
            }
        },

        formatAmount: function (v) {
            return this._oAmountFormat.format(parseFloat(v) || 0);
        }
    });
});