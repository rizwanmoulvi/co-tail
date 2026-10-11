// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {TailcoatMirror} from "../src/TailcoatMirror.sol";

/// forge script script/Deploy.s.sol --rpc-url bsc --broadcast --private-key $OPERATOR_KEY
/// Env: CASH (USDT), OPERATOR, OWNER, ROUTERS (comma list), STOCKS (comma list).
contract Deploy is Script {
    function run() external {
        address cash = vm.envAddress("CASH");
        address operator = vm.envAddress("OPERATOR");
        address owner = vm.envAddress("OWNER");
        address[] memory routers = vm.envAddress("ROUTERS", ",");
        address[] memory stocks = vm.envAddress("STOCKS", ",");

        vm.startBroadcast();
        TailcoatMirror mirror = new TailcoatMirror(IERC20(cash), operator, owner);
        if (routers.length > 0) mirror.setRouters(routers, true);
        if (stocks.length > 0) mirror.setStocks(stocks, true);
        vm.stopBroadcast();
        console.log("TailcoatMirror", address(mirror));
    }
}
