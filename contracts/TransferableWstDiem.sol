// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @notice Transferable ERC-20 share token for the operator-staked wstDIEM V1.
/// @dev Minting and burning are restricted to the vault. API entitlements are not
/// embedded in token transfers; the backend reconciles Venice key limits from balances.
contract TransferableWstDiem {
    string public constant name = "Wrapped Staked DIEM";
    string public constant symbol = "wstDIEM";
    uint8 public constant decimals = 18;

    address public immutable vault;
    uint256 public totalSupply;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 amount);
    event Approval(address indexed owner, address indexed spender, uint256 amount);

    error OnlyVault();

    modifier onlyVault() {
        if (msg.sender != vault) revert OnlyVault();
        _;
    }

    constructor(address vault_) {
        require(vault_ != address(0), "ZERO_VAULT");
        vault = vault_;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _transfer(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        require(allowed >= amount, "ERC20: insufficient allowance");
        if (allowed != type(uint256).max) {
            allowance[from][msg.sender] = allowed - amount;
        }
        _transfer(from, to, amount);
        return true;
    }

    function mint(address to, uint256 amount) external onlyVault {
        require(to != address(0), "ZERO_TO");
        totalSupply += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    function burnFromVault(address from, uint256 amount) external onlyVault {
        require(balanceOf[from] >= amount, "INSUFFICIENT_WSTDIEM");
        balanceOf[from] -= amount;
        totalSupply -= amount;
        emit Transfer(from, address(0), amount);
    }

    function _transfer(address from, address to, uint256 amount) internal {
        require(to != address(0), "ZERO_TO");
        require(balanceOf[from] >= amount, "ERC20: transfer amount exceeds balance");
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
    }
}
